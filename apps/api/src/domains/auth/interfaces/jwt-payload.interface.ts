/** Claims in an access token (spec, "Conventions" → Auth). */
export interface JwtPayload {
  sub: string;
  roleId: string;
  permissions: string[];
}

/** What the JWT strategy attaches to `request.user`. */
export interface AuthUser {
  id: string;
  roleId: string;
  permissions: string[];
}
