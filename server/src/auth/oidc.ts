import * as client from 'openid-client';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import type { Config } from '../config.js';
import { resolveRole, rolesFrom, type LoginState, type User } from './session.js';

type OidcConfig = Config['oidc'];

/**
 * Thin wrapper around openid-client. Discovery happens on first use (and is retried on failure),
 * so the backend can start before the identity provider is reachable.
 */
export class OidcClient {
  private configuration?: Promise<client.Configuration>;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private oidc: OidcConfig,
    private redirectUri: string
  ) {}

  private async discover(): Promise<client.Configuration> {
    const options = this.oidc.allowInsecureHttp ? { execute: [client.allowInsecureRequests] } : undefined;
    if (!this.oidc.discoveryUrl) {
      return client.discovery(new URL(this.oidc.issuer), this.oidc.clientId, this.oidc.clientSecret, undefined, options);
    }
    // The backend reaches the identity provider on a different URL than browsers do (e.g. an
    // in-cluster service name). Fetch metadata there, but insist it names the public issuer.
    const url = new URL('.well-known/openid-configuration', this.oidc.discoveryUrl.replace(/\/?$/, '/'));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OIDC discovery failed: ${response.status} from ${url}`);
    const metadata = (await response.json()) as client.ServerMetadata;
    if (metadata.issuer !== this.oidc.issuer) {
      throw new Error(`OIDC issuer mismatch: discovery returned ${metadata.issuer}, expected ${this.oidc.issuer}`);
    }
    const configuration = new client.Configuration(metadata, this.oidc.clientId, this.oidc.clientSecret);
    if (this.oidc.allowInsecureHttp) client.allowInsecureRequests(configuration);
    return configuration;
  }

  config(): Promise<client.Configuration> {
    this.configuration ??= this.discover().catch((e) => {
      this.configuration = undefined;
      throw e;
    });
    return this.configuration;
  }

  async startLogin(returnTo: string): Promise<{ url: URL; state: LoginState }> {
    const config = await this.config();
    const codeVerifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri,
      scope: this.oidc.scopes,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url, state: { state, nonce, codeVerifier, returnTo, expiresAt: Math.floor(Date.now() / 1000) + 600 } };
  }

  /** Exchanges the authorization code. Returns the user, or a user with no role if they have neither NeoDash role. */
  async finishLogin(callbackUrl: URL, login: LoginState): Promise<{ user: Omit<User, 'role'> & { role: User['role'] | null }; idToken?: string }> {
    const config = await this.config();
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: login.codeVerifier,
      expectedState: login.state,
      expectedNonce: login.nonce,
      idTokenExpected: true,
    });
    const idClaims = tokens.claims() as Record<string, unknown> | undefined;
    // Roles are usually in the ID token; fall back to the access token, which came straight from the
    // token endpoint over the back channel.
    let roles = rolesFrom(idClaims, this.oidc.rolesClaim);
    if (!roles.length && tokens.access_token) {
      try {
        roles = rolesFrom(decodeJwt(tokens.access_token) as Record<string, unknown>, this.oidc.rolesClaim);
      } catch {
        // Opaque access token: nothing more to read.
      }
    }
    return { user: this.toUser(idClaims ?? {}, roles), idToken: tokens.id_token };
  }

  /** Validates a bearer access token (for API clients and automation). */
  async verifyBearer(token: string): Promise<User | null> {
    const config = await this.config();
    const metadata = config.serverMetadata();
    if (!metadata.jwks_uri) throw new Error('Identity provider publishes no jwks_uri');
    this.jwks ??= createRemoteJWKSet(new URL(metadata.jwks_uri));
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, { issuer: this.oidc.issuer }));
    } catch {
      return null;
    }
    // Only tokens issued to this client (Keycloak sets azp; others use aud).
    const aud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (payload.azp !== this.oidc.clientId && !aud.includes(this.oidc.clientId)) return null;
    const user = this.toUser(payload as Record<string, unknown>, rolesFrom(payload as Record<string, unknown>, this.oidc.rolesClaim));
    return user.role ? (user as User) : null;
  }

  async logoutUrl(postLogoutRedirect: string, idToken?: string): Promise<string | null> {
    const config = await this.config();
    if (!config.serverMetadata().end_session_endpoint) return null;
    const params: Record<string, string> = { post_logout_redirect_uri: postLogoutRedirect, client_id: this.oidc.clientId };
    if (idToken) params.id_token_hint = idToken;
    return client.buildEndSessionUrl(config, params).href;
  }

  private toUser(claims: Record<string, unknown>, roles: string[]) {
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    const sub = str(claims.sub) ?? 'unknown';
    return {
      sub,
      username: str(claims[this.oidc.usernameClaim]) ?? str(claims.email) ?? sub,
      name: str(claims.name),
      email: str(claims.email),
      roles,
      role: resolveRole(roles, this.oidc.roleViewer, this.oidc.roleEditor),
    };
  }
}
