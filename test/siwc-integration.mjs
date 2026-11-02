import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
async function load(path, mocks = {}) {
 const r = await build({entryPoints:[path], bundle:true, platform:'node',format:'cjs',write:false,external:['obsidian','jose']});
 const m={exports:{}}; const require=createRequire(import.meta.url);
 new Function('require','module','exports',r.outputFiles[0].text)(n => mocks[n] || require(n),m,m.exports); return m.exports;
}
const {SecureStore}=await load('siwc/storage.ts');
const root=await mkdtemp(join(tmpdir(),'siwc-test-'));
// Fake cipher tests persistence behavior, not OS encryption strength.
const cipher={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).reverse(),decryptString:b=>Buffer.from(b).reverse().toString()};
const store=new SecureStore(root,cipher);
try {
 await store.locked(async()=>{const d=await store.read(); assert.match(d.host, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); await store.write({...d,secret:'test-token'}); await assert.rejects(new SecureStore(root,cipher).locked(async()=>{}));});
 assert.equal((await store.read()).secret,'test-token');
 await writeFile(join(root,'session.lock'),JSON.stringify({pid:2147483647}));
 await store.locked(async()=>assert.equal((await store.read()).secret,'test-token'));
 await writeFile(join(root,'session.lock'),'');
 await assert.rejects(store.locked(async()=>{}));
 await rm(join(root,'session.lock'));

 assert.ok(!(await readFile(join(root,'credentials'))).toString().includes('test-token'));
 await assert.rejects(new SecureStore(root,{...cipher,isEncryptionAvailable:()=>false}).locked(async()=>{}));
 const jose = await import('jose');
 const keys = await jose.generateKeyPair('RS256');
 const {SiwcSession}=await load('siwc/session.ts', {jose:{...jose,createLocalJWKSet:()=>keys.publicKey}});
 const identitySession = new SiwcSession(store,async()=>{});
 identitySession.request = async()=>Response.json({keys:[]});
 identitySession.discovery = async()=>({jwks_uri:'https://auth.openai.com/jwks'});
 const sign = (nonce, aud='issued', iss='https://auth.openai.com') => new jose.SignJWT({nonce}).setProtectedHeader({alg:'RS256'}).setSubject('subject').setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
 assert.equal((await identitySession.validateIdentity(await sign('nonce'),'issued','nonce')).sub,'subject');
 await assert.rejects(identitySession.validateIdentity(await sign('wrong'),'issued','nonce'));
 await assert.rejects(identitySession.validateIdentity(await sign('nonce','other'),'issued','nonce'));
 await assert.rejects(identitySession.validateIdentity(await sign('nonce','issued','https://evil.invalid'),'issued','nonce'));

 await store.locked(()=>store.write({host:'host',active:'issued',accounts:[{client:'issued',subject:'subject',access_token:'old',refresh_token:'refresh',scope:'openid offline_access resource.invoke chatgpt.tokens.use.direct',expires:0}]}));
 const session=new SiwcSession(store,async()=>{}); const original=globalThis.fetch; let refreshes=0;
 globalThis.fetch=async(url,init)=>{
   if(url.includes('/oauth/token')) { refreshes++; assert.ok(init.body.includes('client_id=issued')); assert.ok(!init.body.includes('scope=')); return Response.json({access_token:'new',refresh_token:'rotated',token_type:'Bearer',expires_in:3600,scope:'openid offline_access resource.invoke chatgpt.tokens.use.direct'}); }
   if(url.includes('openid-configuration')) return Response.json({issuer:'https://auth.openai.com',jwks_uri:'https://auth.openai.com/jwks',revocation_endpoint:'https://auth.openai.com/revoke'});
   if(url.endsWith('/revoke')) { assert.ok(init.body.includes('token=rotated')); return new Response(null,{status:200}); }
   throw Error('Unexpected URL');
 };
 try { assert.deepEqual(await Promise.all([session.access(),session.access(),session.access()]),['new','new','new']); assert.equal(refreshes,1); assert.equal((await store.read()).accounts[0].refresh_token,'rotated'); assert.equal(await session.logout(),true); assert.equal((await store.read()).accounts[0].access_token,undefined); await assert.rejects(session.access()); }
 finally {globalThis.fetch=original;}
 await store.locked(async()=>{
   await store.write({host:'urn:uuid:'+'a'.repeat(48),accounts:[]});
   const migrated=await store.read();
   assert.match(migrated.host,/^urn:uuid:[0-9a-f-]{36}$/);
   assert.equal((await store.read()).host,migrated.host);
 });
 // Run actual legacy provider through its factory, retaining API-key routing.
 const {createProvider}=await load('providers/index.ts',{obsidian:{requestUrl:async()=>({json:{data:[{id:'legacy-model'}]}})}});
 const provider=createProvider({providerType:'openai',baseUrl:'https://example.test/v1/chat/completions',model:'legacy-model'},'legacy-key');
 assert.deepEqual(await provider.testConnection(),{ok:true,models:['legacy-model']});
 assert.equal(createProvider({providerType:'siwc',baseUrl:'https://evil.invalid',model:''},'ignored').constructor.name,'SiwcProvider');
 console.log('SIWC storage/rotation/revocation/provider regression assertions passed');
} finally {await rm(root,{recursive:true,force:true});}
