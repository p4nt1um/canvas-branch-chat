# Sign in with ChatGPT (SIWC)

This desktop-only provider uses the documented open-source public-client flow. It preserves existing API-key providers and has no billing fallback.

## Use

In a model configuration, choose Authentication → Continue with ChatGPT, then click the sign-in button. Finish consent in the system browser. The account must permit ChatGPT plan usage. Choose an authorized model and an optional default reasoning effort. Branch and follow-up dialogs can override both for one request. Model names and supported efforts come from the account catalog.

Requests consume eligible ChatGPT plan allowance and any credits enabled in ChatGPT settings. Canvas history remains local. This integration sends text context to the public Responses API with store:false and stream:true; it does not implement image generation, audio, hosted tools, or persistent remote conversations. API-key configuration remains available separately.

## Security and runtime

- Dynamic registration uses a stable UUIDv4 host identity, fresh state/nonce and S256 PKCE. Callback listener binds only 127.0.0.1 with a per-attempt port and fixed /auth/callback path.
- Code exchange uses the issued client ID. JOSE verifies ID-token signature, issuer, audience, expiry, nonce and returning subject. Token-response scopes authorize inference.
- Electron safeStorage encrypts credentials outside the vault, under the Obsidian userData directory. Unavailable or plaintext encryption fails closed. Files are replaced atomically. Tokens are never written to plugin settings, logs or Canvas.
- An in-process queue and exclusive file lock serialize refresh rotation. Dead-process locks are recovered only when their recorded PID is proven absent. Unknown/legacy locks are not automatically stolen. If recovery is necessary, close every Obsidian process before removing session.lock or recovery.lock; retain credentials.
- Logout stops requests, attempts refresh-token revocation with bounded retries, then clears local tokens. Remote failure is disclosed and the user can disconnect the app in ChatGPT Settings.
- Native HTTPS transport uses system proxy discovery. TLS validation is preserved; redirects are rejected. Current request timeout is 120 seconds.

## Validation

Run npm ci, npm test, npm run typecheck and npm run build. Tests exercise protocol validation, SSE fragmentation/completion/errors, signed OIDC tokens, protected-store mechanics, concurrent refresh, revocation, provider routing and per-request model/reasoning payloads.

Manual checks were performed on Windows with Obsidian 1.14.5: sign-in, OS encryption roundtrip, persisted account after reload, dynamic model catalog, Responses streaming, Canvas branches and contextual follow-up with distinct model/effort choices. Other desktop platforms and live forced-refresh/revocation remain unverified. Automated storage tests use a fake cipher to isolate persistence behavior; they do not prove OS encryption.

## Official contract

- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

The feature is a preview. Account availability and supported fields can change; model slugs are not hard-coded.
