/**
 * Claims in an access token (spec, "Conventions" → Auth), plus `sid`: the refresh-token family
 * (one per sign-in) the token was issued for, so "revoke other sessions" can keep this one.
 */
export interface JwtPayload {
  sub: string;
  roleId: string;
  permissions: string[];
  sid?: string;
}

/** What the JWT strategy attaches to `request.user`. */
export interface AuthUser {
  id: string;
  roleId: string;
  permissions: string[];
  /** The session (refresh-token family); absent on tokens minted outside /auth (tests). */
  sessionId?: string;
}
