import { request } from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
/** Native desktop HTTPS, including system proxy routing; no renderer CORS. */
export function desktopFetch(resolveProxy: (url: string) => Promise<string>): typeof fetch {
  return (async (url: string, init: RequestInit = {}) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !['auth.openai.com', 'api.openai.com'].includes(target.hostname) || target.username || target.password) throw new Error('Untrusted SIWC request endpoint');
    const route = await resolveProxy(url);
    const proxy = route.split(';').map(s => s.trim()).find(s => /^(PROXY|HTTPS) /.test(s));
    const agent = proxy ? new HttpsProxyAgent((proxy.startsWith('HTTPS ') ? 'https://' : 'http://') + proxy.split(' ')[1]) : undefined;
    const requestHeaders: Record<string,string> = {}; new Headers(init.headers).forEach((v,k) => requestHeaders[k] = v);
    return new Promise<Response>((resolve, reject) => {
      const req = request(target, { method: init.method || 'GET', headers: requestHeaders, agent }, incoming => {
        const iterator = incoming[Symbol.asyncIterator]();
        const body = new ReadableStream<Uint8Array>({
          async pull(c) { try { const chunk = await iterator.next(); if (chunk.done) c.close(); else c.enqueue(new Uint8Array(chunk.value)); } catch(e) { c.error(e); } },
          async cancel() { incoming.destroy(); req.destroy(); }
        });
        const headers = new Headers(); for (const [k,v] of Object.entries(incoming.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
        resolve(new Response(body, { status: incoming.statusCode || 502, headers }));
      });
      const abort = () => req.destroy(new Error('Request cancelled'));
      init.signal?.addEventListener('abort', abort, { once: true });
      req.on('close', () => init.signal?.removeEventListener('abort', abort));
      req.on('error', reject);
      if (init.signal?.aborted) abort();
      if (init.body) req.write(init.body);
      req.end();
    });
  }) as typeof fetch;
}
