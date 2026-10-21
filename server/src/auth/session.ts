import crypto from 'node:crypto';

// Sessions live in an encrypted, authenticated cookie (AES-256-GCM), so any replica can read them
// with the shared SESSION_SECRET and no session store is needed.

export type Role = 'viewer' | 'editor';

export interface User {
  sub: string;
  username: string;
  name?: string;
  email?: string;
  roles: string[];
  role: Role;
}

export interface Session {
  user: User;
  idToken?: string;
  /** Unix seconds. */
  expiresAt: number;
}

/** Short-lived state carried through the OIDC redirect. */
export interface LoginState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
}

export class CookieSealer {
  private key: Buffer;

  constructor(secret: string, purpose: string) {
    // Separate keys per purpose, so a login-state cookie can never be replayed as a session.
    this.key = Buffer.from(crypto.hkdfSync('sha256', secret, 'neodash', purpose, 32));
  }

  seal(payload: object): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }

  unseal<T extends { expiresAt: number }>(sealed: string | undefined): T | null {
    if (!sealed) return null;
    try {
      const raw = Buffer.from(sealed, 'base64url');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
      const payload = JSON.parse(json) as T;
      return payload.expiresAt > Date.now() / 1000 ? payload : null;
    } catch {
      return null;
    }
  }
}

/** Reads a dot-separated claim path, e.g. "realm_access.roles". */
export function claimAt(claims: Record<string, unknown> | undefined, path: string): unknown {
  let current: unknown = claims;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveRole(roles: string[], roleViewer: string, roleEditor: string): Role | null {
  if (roles.includes(roleEditor)) return 'editor';
  if (roles.includes(roleViewer)) return 'viewer';
  return null;
}

export function rolesFrom(claims: Record<string, unknown> | undefined, path: string): string[] {
  const value = claimAt(claims, path);
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean);
  return [];
}

/**
 * Only relative paths, or absolute URLs on one of our own origins, so the login redirect can't be
 * turned into an open redirect.
 */
export function safeReturnTo(value: unknown, allowedOrigins: string[] = []): string {
  if (typeof value !== 'string' || value.includes('\\')) return '/';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    if (allowedOrigins.includes(url.origin)) return url.href;
  } catch {
    // Not a URL.
  }
  return '/';
}
