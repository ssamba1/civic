/* Route-level skeleton — mirrors the Members page shell (header + view toggle +
   search + role chips + roster table) so the swap to real content has no
   geometry shift. Placeholders ride the shared `.skeleton` shimmer (theme-aware,
   reduced-motion safe). */

const ROW_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];

// Role chips vary in width in the real toolbar (All / Admins / Supervisors /
// Dispatchers / Residents / Contractors) — stagger the placeholder widths to
// match.
const CHIPS = [
  { k: "c1", w: "w-14" },
  { k: "c2", w: "w-20" },
  { k: "c3", w: "w-24" },
  { k: "c4", w: "w-24" },
  { k: "c5", w: "w-20" },
  { k: "c6", w: "w-16" },
  { k: "c7", w: "w-24" },
];

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading members"
      className="relative flex flex-col min-h-dvh bg-background"
    >
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Header — instant static text at the real weight, no shimmer. */}
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Members
            </h1>
            <p className="text-[13px] text-faint">
              People with access to this city.
            </p>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          {/* Controls row — view toggle (left) + search (right). */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-hairline bg-overlay p-0.5">
              <div className="h-7 w-20 rounded-[calc(var(--radius-md)-2px)] skeleton" />
              <div className="h-7 w-24 rounded-[calc(var(--radius-md)-2px)] skeleton" />
            </div>
            <div className="h-8 w-full rounded-[var(--radius-md)] skeleton sm:w-64" />
          </div>

          {/* Role chips row. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {CHIPS.map((c) => (
              <div
                key={c.k}
                className={`h-8 ${c.w} rounded-[var(--radius-md)] skeleton`}
              />
            ))}
          </div>

          {/* Roster table — same overflow-x-auto + min-width shell as the real
              table so all seven columns line up on swap. */}
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-4 py-3">
                    <div className="h-2.5 w-16 rounded skeleton" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-2.5 w-12 rounded skeleton" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-2.5 w-10 rounded skeleton" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-2.5 w-12 rounded skeleton" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="ml-auto h-2.5 w-14 rounded skeleton" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-2.5 w-16 rounded skeleton" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-2.5 w-16 rounded skeleton" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROW_KEYS.map((k) => (
                  <tr
                    key={k}
                    className="border-b border-hairline last:border-b-0"
                  >
                    {/* Member — name + email, two lines. */}
                    <td className="px-4 py-3 align-middle">
                      <div className="h-3.5 w-40 rounded skeleton" />
                      <div className="mt-2 h-2.5 w-52 rounded skeleton" />
                    </td>
                    {/* Phone. */}
                    <td className="px-4 py-3 align-middle">
                      <div className="h-3 w-24 rounded skeleton" />
                    </td>
                    {/* Role badge. */}
                    <td className="px-4 py-3 align-middle">
                      <div className="h-5 w-16 rounded-full skeleton" />
                    </td>
                    {/* Team. */}
                    <td className="px-4 py-3 align-middle">
                      <div className="h-3 w-20 rounded skeleton" />
                    </td>
                    {/* Reports — right-aligned. */}
                    <td className="px-4 py-3 align-middle">
                      <div className="ml-auto h-3 w-6 rounded skeleton" />
                    </td>
                    {/* Last active. */}
                    <td className="px-4 py-3 align-middle">
                      <div className="h-3 w-16 rounded skeleton" />
                    </td>
                    {/* Last sign-in. */}
                    <td className="px-4 py-3 align-middle">
                      <div className="h-3 w-20 rounded skeleton" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
