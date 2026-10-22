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
    // Change a character in the middle: the last ones can be base64 padding bits, which change nothing.
    const middle = Math.floor(sealed.length / 2);
    const flipped = sealed.slice(0, middle) + (sealed[middle] === 'A' ? 'B' : 'A') + sealed.slice(middle + 1);
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
  const allowed = ['https://neodash.example', 'http://localhost:5173'];

  it('allows relative paths and absolute URLs on our own origins', () => {
    expect(safeReturnTo('/dashboards/abc?page=2', allowed)).toBe('/dashboards/abc?page=2');
    expect(safeReturnTo('http://localhost:5173/dashboards/abc', allowed)).toBe('http://localhost:5173/dashboards/abc');
  });

  it('rejects everything else', () => {
    for (const bad of ['https://evil.example', 'https://neodash.example.evil.com/', '//evil.example', '/\\evil.example', 'dashboards', 'javascript:alert(1)', undefined, 42]) {
      expect(safeReturnTo(bad, allowed)).toBe('/');
    }
  });
});
