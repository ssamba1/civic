// Shared types for the inbound feature / help request channel (migration 043).
// Kept framework-free so both the client form and the server action import it.

export const REQUEST_KINDS = [
  { value: "feature", label: "New feature" },
  { value: "qol", label: "Quality-of-life improvement" },
  { value: "setup", label: "Help setting up my city" },
  { value: "help", label: "General help / support" },
  { value: "other", label: "Something else" },
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number]["value"];

export const REQUEST_KIND_VALUES = REQUEST_KINDS.map((k) => k.value);

export interface RequestInput {
  kind: RequestKind;
  title: string;
  body: string;
  email?: string;
  cityName?: string;
  source?: string;
}

export interface RequestRow {
  id: string;
  kind: RequestKind;
  title: string;
  body: string;
  email: string | null;
  city_name: string | null;
  source: string | null;
  status: "new" | "triaged" | "done" | "declined";
  created_at: string;
}
