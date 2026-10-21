import { describe, expect, it } from 'vitest';
import { CookieSealer, resolveRole, rolesFrom, safeReturnTo } from '../src/auth/session.js';

const SECRET = 'x'.repeat(40);
const future = () => Math.floor(Date.now() / 1000) + 60;

describe('CookieSealer', () => {
  it('round-trips a payload', () => {
    const s = new CookieSealer(SECRET, 'session');
    const payload = { user: 'ann', expiresAt: future() };
    expect(s.unseal(s.seal(payload))).toEqual(payload);
  });

  it('rejects tampered, expired, foreign-key and wrong-purpose cookies', () => {
    const s = new CookieSealer(SECRET, 'session');
    const sealed = s.seal({ user: 'ann', expiresAt: future() });
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(s.unseal(flipped)).toBeNull();
    expect(s.unseal(s.seal({ user: 'ann', expiresAt: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
    expect(new CookieSealer('y'.repeat(40), 'session').unseal(sealed)).toBeNull();
    expect(new CookieSealer(SECRET, 'login').unseal(sealed)).toBeNull();
    expect(s.unseal('garbage')).toBeNull();
    expect(s.unseal(undefined)).toBeNull();
  });
});

describe('roles', () => {
  it('reads roles from a nested claim', () => {
    expect(rolesFrom({ realm_access: { roles: ['a', 'neodash-viewer'] } }, 'realm_access.roles')).toEqual(['a', 'neodash-viewer']);
    expect(rolesFrom({ groups: 'neodash-editor other' }, 'groups')).toEqual(['neodash-editor', 'other']);
    expect(rolesFrom({}, 'realm_access.roles')).toEqual([]);
  });

  it('prefers editor over viewer and denies everyone else', () => {
    expect(resolveRole(['neodash-viewer', 'neodash-editor'], 'neodash-viewer', 'neodash-editor')).toBe('editor');
    expect(resolveRole(['neodash-viewer'], 'neodash-viewer', 'neodash-editor')).toBe('viewer');
    expect(resolveRole(['offline_access'], 'neodash-viewer', 'neodash-editor')).toBeNull();
  });
});

describe('safeReturnTo', () => {
  it('only allows same-site relative paths', () => {
    expect(safeReturnTo('/dashboards/abc?page=2')).toBe('/dashboards/abc?page=2');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'dashboards', undefined, 42]) {
      expect(safeReturnTo(bad)).toBe('/');
    }
  });
});
