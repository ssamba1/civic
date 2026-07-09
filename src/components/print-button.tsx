"use client";

/** Print/Save-PDF trigger for printable report pages (kept as a tiny client
 *  island so the surrounding page can stay a server component). */
export function PrintButton({
  label = "Print / Save PDF",
}: {
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-[var(--radius-md)] border border-hairline px-3 py-1.5 text-[13px] font-medium hover:bg-overlay print:hidden"
    >
      {label}
    </button>
  );
}
