import { createServer, Server } from 'http';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { SecureStore } from './storage';
import { createAttempt, validateCallback, validateScopes, RESOURCE } from './protocol';
const issuer = 'https://auth.openai.com';
const tokenEndpoint = issuer + '/api/accounts/oauth/token';
export class SiwcSession {
  private listener?: Server;
  private cancelled = false;
  private controllers = new Set<AbortController>();
  constructor(private store: SecureStore, private open: (url: string) => Promise<void>, private transport: typeof fetch = (...args) => fetch(...args)) {}
  stop() { this.cancelled = true; this.listener?.close(); for (const c of this.controllers) c.abort(); this.controllers.clear(); }
  async request(url: string, init: RequestInit = {}) {
    const controller = new AbortController(); this.controllers.add(controller);
    const abort = () => controller.abort();
    init.signal?.addEventListener('abort', abort, { once: true });
    if (init.signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 120000);
    const cleanup = () => { clearTimeout(timer); this.controllers.delete(controller); init.signal?.removeEventListener('abort', abort); };
    try {
      const response = await this.transport(url, { ...init, signal: controller.signal, redirect: 'error' });
      if (!response.body) { cleanup(); return response; }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(c) { try { const chunk = await reader.read(); if (chunk.done) { cleanup(); c.close(); } else c.enqueue(chunk.value); } catch(e) { cleanup(); c.error(e); } },
        async cancel() { controller.abort(); cleanup(); await reader.cancel(); }
      });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch(e) { cleanup(); throw new Error('SIWC network request failed or cancelled'); }
  }
  private async form(url: string, data: URLSearchParams) {
    const r = await this.request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data.toString() });
    if (!r.ok) { await r.body?.cancel(); throw new Error(`SIWC token operation failed (${r.status}); sign in again if your session expired`); }
    return r;
  }
  private async validateIdentity(token: string, client: string, nonce?: string) {
    const config = await this.discovery();
    const jwksResponse = await this.request(config.jwks_uri);
    if (!jwksResponse.ok) throw new Error('OpenID signing keys unavailable');
    const jwks = await jwksResponse.json();
    const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), { issuer, audience: client, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'] });
    if (!payload.sub || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== client) || (payload.azp !== undefined && payload.azp !== client) || (nonce && payload.nonce !== nonce)) throw new Error('Invalid OpenID identity');
    return payload;
  }
  private async discovery() {
    const r = await this.request(issuer + '/.well-known/openid-configuration');
    if (!r.ok) throw new Error('OpenID discovery failed');
    const c = await r.json();
    if (c.issuer !== issuer) throw new Error('Invalid OpenID issuer');
    for (const key of ['jwks_uri', 'revocation_endpoint']) if (new URL(c[key]).origin !== issuer) throw new Error('Untrusted OpenID endpoint');
    return c;
  }
  private tokens(t: any, old?: any) {
    if (t.token_type?.toLowerCase() !== 'bearer' || typeof t.access_token !== 'string' || !t.access_token || typeof t.refresh_token !== 'string' || !t.refresh_token || !Number.isFinite(t.expires_in) || t.expires_in <= 0) throw new Error('Invalid token response');
    const scopes = validateScopes(t.scope ?? old?.scope);
    return { access_token: t.access_token, refresh_token: t.refresh_token, id_token: t.id_token ?? old?.id_token, scope: scopes.join(' '), expires: Date.now() + t.expires_in * 1000 };
  }
  async accounts() { return this.store.locked(async () => { const db = await this.store.read(); return { active: db.active, accounts: db.accounts.map((a: any) => ({ client: a.client, label: `${a.email || a.subject} (${a.client})`, signedIn: !!a.access_token })) }; }); }
  async select(client: string) { this.stop(); this.cancelled = false; await this.store.locked(async () => { const db = await this.store.read(); if (!db.accounts.some((a: any) => a.client === client && a.access_token)) throw new Error('Sign in to this account first'); db.active = client; await this.store.write(db); }); }
  async login(client?: string) {
    if (this.listener) throw new Error('A sign-in is already pending; finish or cancel it first');
    this.cancelled = false;
    const db = await this.store.locked(async () => { const data = await this.store.read(); await this.store.write(data); return data; });
      const old = client ? db.accounts.find((a: any) => a.client === client) : undefined;
      if (client && !old) throw new Error('Unknown account');
      const server = createServer(); this.listener = server;
      try {
        await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
        const port = (server.address() as any).port;
        const attempt = createAttempt(`http://127.0.0.1:${port}/auth/callback`, db.host, old?.client);
        const auth = new URL(attempt.url); if (old?.id_token) auth.searchParams.set('id_token_hint', old.id_token);
        const result = new Promise<URLSearchParams>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Sign-in timed out')), 300000);
          server.once('close', () => { clearTimeout(timer); reject(new Error('Sign-in cancelled')); });
          server.on('request', (req, res) => {
            res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Security-Policy', "default-src 'none'");
            if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${port}` || !req.url?.startsWith('/auth/callback?')) { res.writeHead(400).end('Invalid callback'); return; }
            try { const form = validateCallback(attempt.redirect + req.url.slice('/auth/callback'.length), attempt); clearTimeout(timer); res.end('Authorization received. Return to Obsidian.'); resolve(form); }
            catch { res.writeHead(400).end('Invalid authorization callback'); if (attempt.used) reject(new Error('Authorization failed or declined')); }
          });
        });
        // Attach the rejection handler before opening the system browser.
        const completed = result.then(async form => {
          const issued = form.get('client_id')!;
          const t = await (await this.form(tokenEndpoint, form)).json();
          const identity = await this.validateIdentity(t.id_token, issued, attempt.nonce);
          if (old && old.subject !== identity.sub) throw new Error('Returning account identity mismatch');
          const tokens = this.tokens(t);
          if (this.cancelled) throw new Error('Sign-in cancelled');
          const record = { client: issued, subject: identity.sub, email: identity.email, ...tokens };
          await this.store.locked(async () => { const latest = await this.store.read(); latest.accounts = latest.accounts.filter((a: any) => a.client !== issued); latest.accounts.push(record); latest.active = issued; await this.store.write(latest); });
        });
        await this.open(auth.toString()).catch(() => { server.close(); });
        await completed;
      } finally { server.close(); this.listener = undefined; }
  }
  async access() {
    if (this.cancelled) throw new Error('SIWC session stopped');
    return this.store.locked(async () => {
      const db = await this.store.read(); const a = db.accounts.find((x: any) => x.client === db.active);
      if (!a?.access_token) throw new Error('Continue with ChatGPT in settings first');
      validateScopes(a.scope);
      if (a.expires < Date.now() + 60000) {
        const t = await (await this.form(tokenEndpoint, new URLSearchParams({ grant_type: 'refresh_token', client_id: a.client, refresh_token: a.refresh_token, resource: RESOURCE }))).json();
        const next = this.tokens(t, a);
        if (t.id_token) { const p = await this.validateIdentity(t.id_token, a.client); if (p.sub !== a.subject) throw new Error('Refresh identity mismatch'); }
        Object.assign(a, next); await this.store.write(db);
      }
      if (this.cancelled) throw new Error('SIWC session stopped');
      return a.access_token as string;
    });
  }
  async logout(): Promise<boolean> {
    this.stop();
    return this.store.locked(async () => {
      const db = await this.store.read(); const a = db.accounts.find((x: any) => x.client === db.active); let revoked = false;
      if (a?.refresh_token) {
        try { const config = await this.discovery(); for (let n = 0; n < 3; n++) { try { const r = await this.form(config.revocation_endpoint, new URLSearchParams({ client_id: a.client, token: a.refresh_token, token_type_hint: 'refresh_token' })); revoked = r.status === 200; break; } catch { if (n < 2) await new Promise(r => setTimeout(r, 250 * 2 ** n)); } } } catch { /* Local sign-out still clears credentials. */ }
      }
      if (a) for (const key of ['access_token', 'refresh_token', 'id_token', 'scope', 'expires']) delete a[key];
      delete db.active; await this.store.write(db); return revoked;
    });
  }
}
let session: SiwcSession | undefined;
export function configureSession(s?: SiwcSession) { session = s; }
export function getSession() { if (!session) throw new Error('SIWC requires Obsidian desktop with OS encryption'); return session; }
