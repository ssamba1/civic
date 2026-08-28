/** Shared between the server actions and the client console. Lives outside the
 *  "use server" module because a server-action file may only export async
 *  functions. Mirrors the doc_kind CHECK constraint in migration 065. */
export const DOC_KINDS = ["policy", "contract", "spec", "other"] as const;

export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  policy: "Policy",
  contract: "Contract",
  spec: "Spec",
  other: "Other",
};
