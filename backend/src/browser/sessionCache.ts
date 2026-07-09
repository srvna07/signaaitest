import fs from 'fs';
import path from 'path';

/** Directory where per-environment session state files are stored. */
const CACHE_DIR = path.join(process.cwd(), '.browser-sessions');

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** Returns the full path to the session file for a given environment ID. */
export function sessionPath(environmentId: string): string {
  return path.join(CACHE_DIR, `${environmentId}.json`);
}

/** Returns true if a cached session file exists for the environment. */
export function hasSession(environmentId: string): boolean {
  return fs.existsSync(sessionPath(environmentId));
}

/** Deletes the cached session for the environment (treats it as expired). */
export function deleteSession(environmentId: string): void {
  const p = sessionPath(environmentId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** Saves a Playwright storageState JSON string to disk. */
export function saveSession(environmentId: string, storageStateJson: string): void {
  ensureCacheDir();
  fs.writeFileSync(sessionPath(environmentId), storageStateJson, 'utf-8');
}
