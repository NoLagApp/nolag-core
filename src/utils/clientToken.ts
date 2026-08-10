/**
 * Client token shape detection.
 *
 * Distinguishes a customer-minted client token (an HS256 JWT: three base64url
 * dot-segments, always starting "eyJ" because the header decodes from `{"`)
 * from an opaque actor token (at_live_<keyId>.<secret>: two segments, never
 * starting "eyJ").
 *
 * A cheap shape check only. It decides which verification path to take; it
 * proves nothing about the token.
 */
export function isClientTokenJwt(token: string): boolean {
  return token.startsWith("eyJ") && token.split(".").length === 3;
}
