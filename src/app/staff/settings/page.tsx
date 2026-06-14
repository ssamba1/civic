import { Building2, Clock, DollarSign } from "lucide-react";

// Staff settings — read-only configuration overview for the demo:
// department routing, cost rules, and SLA targets that drive the pipeline.
const DEPARTMENTS = [
  {
    name: "Public Works",
    crews: "Paving · Concrete · Sign · Drain",
    contact: "dispatch@cumming.gov",
  },
  { name: "Utilities", crews: "Line crew", contact: "utilities@cumming.gov" },
  { name: "Parks", crews: "Cleanup · Arborist", contact: "parks@cumming.gov" },
  { name: "Sanitation", crews: "Cleanup", contact: "sanitation@cumming.gov" },
];

const COST_RULES = [
  { category: "Pothole", est: "30 min", materials: "Cold patch, tamper" },
  {
    category: "Streetlight",
    est: "60 min",
    materials: "Bulb, fuse, lift truck",
  },
  {
    category: "Sidewalk damage",
    est: "240 min",
    materials: "Concrete mix, forms",
  },
  { category: "Water leak", est: "120 min", materials: "Varies by severity" },
  { category: "Tree down", est: "90 min", materials: "Chainsaw, chipper" },
];

const SLA = [
  { tier: "Emergency", target: "Immediate dispatch" },
  { tier: "High severity (4–5)", target: "24 hours" },
  { tier: "Standard (2–3)", target: "72 hours" },
  { tier: "Low (1)", target: "7 days" },
];

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-blue-600" />
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default function StaffSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Routing, cost, and service-level rules driving the dispatch pipeline ·
          Cumming, GA
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card icon={Building2} title="Departments &amp; routing">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {DEPARTMENTS.map((d) => (
              <li
                key={d.name}
                className="flex items-center justify-between py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {d.name}
                  </p>
                  <p className="text-xs text-zinc-500">{d.crews}</p>
                </div>
                <span className="text-xs text-zinc-400">{d.contact}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card icon={Clock} title="SLA targets">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {SLA.map((s) => (
              <li
                key={s.tier}
                className="flex items-center justify-between py-2.5"
              >
                <span className="text-sm text-zinc-900 dark:text-zinc-100">
                  {s.tier}
                </span>
                <span className="text-sm font-medium text-blue-600">
                  {s.target}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card icon={DollarSign} title="Cost rules">
          <div className="overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Est.</th>
                  <th className="px-3 py-2 font-medium">Materials</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {COST_RULES.map((c) => (
                  <tr key={c.category}>
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {c.category}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{c.est}</td>
                    <td className="px-3 py-2 text-zinc-500">{c.materials}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
