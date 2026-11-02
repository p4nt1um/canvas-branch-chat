import { promises as fs } from 'fs';
import { join } from 'path';
import { randomBytes, randomUUID } from 'crypto';
export interface Cipher { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string; getSelectedStorageBackend?(): string }
export class SecureStore {
  constructor(private root: string, private cipher: Cipher) {}
  private queue: Promise<unknown> = Promise.resolve();
  locked<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => this.exclusive(fn));
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.cipher.isEncryptionAvailable() || this.cipher.getSelectedStorageBackend?.() === 'basic_text') throw new Error('OS credential encryption unavailable');
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    let lock;
    const lockPath = join(this.root, 'session.lock');
    for (let attempt = 0; attempt < 2; attempt++) {
      try { lock = await fs.open(lockPath, 'wx', 0o600); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 0) throw new Error('Another SIWC operation is active. Retry after it completes.');
        // Serialize stale-lock recovery; never steal from a live or unknown owner.
        let recovery;
        try {
          recovery = await fs.open(join(this.root, 'recovery.lock'), 'wx', 0o600);
          const owner = JSON.parse(await fs.readFile(lockPath, 'utf8'));
          if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error('Unknown lock owner');
          let dead = false;
          try { process.kill(owner.pid, 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
          if (!dead) throw new Error('Live lock owner');
          await fs.unlink(lockPath);
        } catch { throw new Error('Another SIWC operation is active. Retry after it completes.'); }
        finally { if (recovery) { await recovery.close(); await fs.unlink(join(this.root, 'recovery.lock')); } }
      }
    }
    if (!lock) throw new Error('Cannot acquire SIWC credential lock');
    try { await lock.writeFile(JSON.stringify({ pid: process.pid })); return await fn(); } finally { await lock.close(); await fs.unlink(join(this.root, 'session.lock')); }
  }
  async read(): Promise<any> {
    try {
      const data = JSON.parse(this.cipher.decryptString(await fs.readFile(join(this.root, 'credentials'))));
      if (typeof data.host === 'string' && /^urn:uuid:[0-9a-f]{48}$/i.test(data.host)) {
        if (data.accounts?.length) throw new Error('Registered host requires manual recovery');
        data.host = `urn:uuid:${randomUUID()}`;
        await this.write(data);
      }
      return data;
    }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { host: `urn:uuid:${randomUUID()}`, accounts: [] }; throw new Error('Cannot read protected SIWC credentials'); }
  }
  async write(data: unknown) {
    const temp = join(this.root, `pending-${randomBytes(12).toString('hex')}`);
    try { await fs.writeFile(temp, this.cipher.encryptString(JSON.stringify(data)), { flag: 'wx', mode: 0o600 }); await fs.rename(temp, join(this.root, 'credentials')); }
    finally { await fs.unlink(temp).catch(() => {}); }
  }
}
