import { tool } from "ai";
import { z } from "zod/v4";
import type { ChatContext } from "@/lib/ai/chat/context";
import { isRouteAllowed } from "@/lib/ai/chat/navigation";
import { searchCorpus } from "@/lib/ai/chat/retrieval";
import { isStaffRole } from "@/lib/ai/chat/scope";
import { CATEGORY_SLA_TARGETS } from "@/lib/dashboard-data";
import type { ReportCategory } from "@/lib/types";

const REPORT_LIMIT = 20;
const BACKLOG_STATUSES = ["open", "dispatched", "in_progress"];

/**
 * Build the read/navigate tool set bound to a request's ChatContext. All data
 * reads use ctx.supabase (RLS-scoped); no tool mutates data. Tool execute
 * functions never throw. They return a structured `{ error }` so the model can
 * recover conversationally.
 */
export function buildChatTools(ctx: ChatContext) {
  const base = {
    searchHelpDocs: tool({
      description:
        "Search Civic's help/FAQ knowledge base for how the product works (privacy, blur, Open311, cost, status updates, how to report). Use this for any 'how does X work' question before answering.",
      inputSchema: z.object({
        query: z.string().describe("the user's help question, in their words"),
      }),
      execute: async ({ query }) => {
        const results = searchCorpus(query, 3).map((d) => ({
          id: d.id,
          title: d.title,
          body: d.body,
        }));
        return { results };
      },
    }),

    getMyReports: tool({
      description:
        "List the reports the current signed-in user has filed, with status. Use when they ask about 'my reports' or 'my pothole'. Only works for signed-in users.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.userId) {
          return {
            error:
              "The user is not signed in. Ask them to sign in to see their own reports.",
          };
        }
        const { data, error } = await ctx.supabase
          .from("reports")
          .select("id, status, address, description, created_at")
          .eq("reporter_id", ctx.userId)
          .order("created_at", { ascending: false })
          .limit(REPORT_LIMIT);
        if (error) return { error: "Could not load reports right now." };
        return { reports: data ?? [] };
      },
    }),

    getReportStatus: tool({
      description:
        "Get the current status and timeline of one report by its id. RLS ensures only reports the user is allowed to see are returned.",
      inputSchema: z.object({
        reportId: z.string().describe("the report UUID"),
      }),
      execute: async ({ reportId }) => {
        const { data, error } = await ctx.supabase
          .from("reports")
          .select("id, status, address, created_at, updated_at")
          .eq("id", reportId)
          .maybeSingle();
        if (error) return { error: "Could not load that report." };
        if (!data)
          return { error: "No report with that id is visible to you." };
        return { report: data };
      },
    }),

    getCityStats: tool({
      description:
        "Get public headline stats (total, open, resolved report counts) for a city by its slug (e.g. 'cumming'). Reads the public dashboard view.",
      inputSchema: z.object({
        slug: z.string().describe("the city slug, e.g. 'cumming'"),
      }),
      execute: async ({ slug }) => {
        const [total, open, closed] = await Promise.all([
          ctx.supabase
            .from("dashboard_reports_view")
            .select("id", { count: "exact", head: true })
            .eq("city_slug", slug),
          ctx.supabase
            .from("dashboard_reports_view")
            .select("id", { count: "exact", head: true })
            .eq("city_slug", slug)
            .eq("status", "open"),
          ctx.supabase
            .from("dashboard_reports_view")
            .select("id", { count: "exact", head: true })
            .eq("city_slug", slug)
            .eq("status", "closed"),
        ]);
        if (total.error) return { error: "Could not load city stats." };
        return {
          city: slug,
          total: total.count ?? 0,
          open: open.count ?? 0,
          resolved: closed.count ?? 0,
        };
      },
    }),

    navigateTo: tool({
      description:
        "Open a screen for the user by navigating to an in-app route (e.g. '/report', '/user/my-reports', '/city/cumming/map'). Use when the user asks to go somewhere or when it helps them complete a task. Only in-app routes are allowed.",
      inputSchema: z.object({
        route: z
          .string()
          .describe("an in-app path beginning with '/', no query string"),
      }),
      execute: async ({ route }) => {
        if (!isRouteAllowed(route, ctx.role)) {
          return {
            error: `Cannot navigate to "${route}" for this user. Suggest an allowed screen instead.`,
          };
        }
        return { navigate: route };
      },
    }),
  };

  // Resident/anon scope stops here. Staff roles get read-only operational tools
  // scoped to their own city (default). All reads still run under the caller's
  // RLS-scoped client, so the gate widens the toolset, never the data access.
  if (!scopeAllowsStaffReads(ctx)) return base;

  return {
    ...base,

    getSlaOverdueReports: tool({
      description:
        "STAFF ONLY. List open backlog reports past their category SLA window in a city (defaults to the staff member's own city). Use for 'what's overdue' / 'what needs attention'.",
      inputSchema: z.object({
        slug: z
          .string()
          .optional()
          .describe("city slug; omit to use the staff member's city"),
      }),
      execute: async ({ slug }) => {
        const citySlug = slug ?? ctx.citySlug;
        if (!citySlug) return { error: "No city in scope to check." };
        const { data, error } = await ctx.supabase
          .from("dashboard_reports_view")
          .select("id, category, status, address, created_at")
          .eq("city_slug", citySlug)
          .in("status", BACKLOG_STATUSES);
        if (error) return { error: "Could not load the backlog right now." };
        const now = Date.now();
        const overdue = (data ?? [])
          .filter((r) => {
            const target =
              CATEGORY_SLA_TARGETS[r.category as ReportCategory] ??
              CATEGORY_SLA_TARGETS.other;
            const ageH = (now - Date.parse(r.created_at)) / 3_600_000;
            return ageH >= target;
          })
          .slice(0, REPORT_LIMIT);
        return {
          city: citySlug,
          overdueCount: overdue.length,
          reports: overdue,
        };
      },
    }),

    getTeamWorkload: tool({
      description:
        "STAFF ONLY. Count open backlog reports grouped by owning team in a city (defaults to the staff member's own city). Use for 'which team is busiest' / workload questions.",
      inputSchema: z.object({
        slug: z
          .string()
          .optional()
          .describe("city slug; omit to use the staff member's city"),
      }),
      execute: async ({ slug }) => {
        const citySlug = slug ?? ctx.citySlug;
        if (!citySlug) return { error: "No city in scope to check." };
        const { data, error } = await ctx.supabase
          .from("dashboard_reports_view")
          .select("team_key, status")
          .eq("city_slug", citySlug)
          .in("status", BACKLOG_STATUSES);
        if (error) return { error: "Could not load team workload right now." };
        const byTeam: Record<string, number> = {};
        for (const r of data ?? []) {
          const key = (r.team_key as string) ?? "unassigned";
          byTeam[key] = (byTeam[key] ?? 0) + 1;
        }
        return { city: citySlug, workload: byTeam };
      },
    }),
  };
}

/** Whether the current scope may use staff-only reads. */
export function scopeAllowsStaffReads(ctx: ChatContext): boolean {
  return isStaffRole(ctx.role);
}
