import { OrgTreeBuilder } from "@/components/admin/org-tree-builder";

export const dynamic = "force-dynamic";

export default function AdminOrgTreePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Routing org tree
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Describe how your city dispatches repair work and AI proposes a
          routing tree, teams, sub-teams, crews and external contractors, with
          the categories, skills, capacity and per-job cost that drive automatic
          assignment. Review and prune the proposal, then commit it. Reports are
          then load-balanced across the tree by cost, SLA risk and current load.
        </p>
      </div>

      <OrgTreeBuilder />
    </div>
  );
}
