/**
 * How an app decides which actors may reach it.
 *
 * Open   every active actor in the project has access, with no stored grant.
 *        Access records are synthesised during resolution, never persisted.
 * Restricted  an explicit actor_app_access row is required.
 */
export enum EAppAccessMode {
  Open = "open",
  Restricted = "restricted",
}
