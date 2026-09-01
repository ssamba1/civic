// Client-safe shared shapes for Open311 API key management. Kept out of
// admin-keys.ts (which is `server-only`) so client components. The admin
// manager UI. Can import the scope list and row type without pulling the
// service-role write path into the browser bundle.

export const API_KEY_SCOPES = ["open311:write", "open311:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ApiKeyRow {
  id: string;
  label: string;
  cityId: string | null;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
}
