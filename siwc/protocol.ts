import { randomBytes, createHash, timingSafeEqual } from 'crypto';

export const RESOURCE = 'https://api.openai.com/v1';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const encode = (bytes: Buffer): string => bytes.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export const challenge = (verifier: string): string => encode(createHash('sha256').update(verifier).digest());
export function createAttempt(redirect: string, host: string, client = 'dynamic_agent_client') {
  const uri = new URL(redirect);
  if (uri.protocol !== 'http:' || uri.hostname !== '127.0.0.1' || uri.pathname !== '/auth/callback' || uri.search || uri.hash || uri.username || uri.password)
    throw new Error('Invalid loopback redirect');
  if (!/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(host)) throw new Error('Valid stable UUIDv4 host identifier required');
  const verifier = encode(randomBytes(32));
  const state = encode(randomBytes(32));
  const nonce = encode(randomBytes(32));
  const params = new URLSearchParams({ client_id: client, ext_agent_host_id: host, response_type: 'code', redirect_uri: redirect, scope: SCOPES, resource: RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: challenge(verifier) });
  if (client === 'dynamic_agent_client') params.set('agent_name_hint', 'Canvas Branch Chat SIWC');
  return { verifier, state, nonce, redirect, client, expires: Date.now() + 300000, used: false, url: `https://auth.openai.com/api/accounts/authorize?${params}` };
}
export function validateCallback(raw: string, attempt: ReturnType<typeof createAttempt>) {
  const url = new URL(raw);
  const expected = new URL(attempt.redirect);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.hash || url.username || url.password) throw new Error('Invalid callback destination');
  if (attempt.used || Date.now() > attempt.expires) throw new Error('Expired authorization attempt');
  for (const key of ['state', 'code', 'client_id', 'error']) if (url.searchParams.getAll(key).length > 1) throw new Error('Duplicate callback parameter');
  const state = Buffer.from(url.searchParams.get('state') || '');
  const wanted = Buffer.from(attempt.state);
  if (state.length !== wanted.length || !timingSafeEqual(state, wanted)) throw new Error('Invalid OAuth state');
  attempt.used = true;
  if (url.searchParams.has('error')) throw new Error('Authorization declined or failed');
  const client = url.searchParams.get('client_id') || (attempt.client === 'dynamic_agent_client' ? '' : attempt.client);
  if (!client || client === 'dynamic_agent_client' || (attempt.client !== 'dynamic_agent_client' && client !== attempt.client)) throw new Error('Invalid issued client ID');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Missing authorization code');
  return new URLSearchParams({ grant_type: 'authorization_code', client_id: client, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect, resource: RESOURCE });
}
export function validateScopes(scope: unknown): string[] {
  if (typeof scope !== 'string') throw new Error('Missing granted scopes');
  const scopes = scope.split(/\s+/);
  for (const required of ['openid', 'offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct']) if (!scopes.includes(required)) throw new Error('Required permission not granted');
  return scopes;
}

/** Parse complete SSE events, preserving UTF-8 and partial lines across chunks. */
export async function readResponses(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', text = '', completed = false;
  function event(frame: string) {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return;
    let value;
    try { value = JSON.parse(data); } catch { throw new Error('Malformed Responses event'); }
    if (value.type === 'response.output_text.delta') {
      if (typeof value.delta !== 'string' || completed) throw new Error('Invalid text event');
      text += value.delta; onText(value.delta);
    } else if (value.type === 'response.completed') completed = true;
    else if (['error', 'response.failed', 'response.incomplete'].includes(value.type)) throw new Error('ChatGPT request failed or incomplete; check plan usage and permissions');
  }
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) { event(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
      if (buffer.length > 1048576) throw new Error('SSE event too large');
      if (chunk.done) break;
    }
    if (buffer.trim() || !completed) throw new Error('Interrupted Responses stream');
    return text;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
