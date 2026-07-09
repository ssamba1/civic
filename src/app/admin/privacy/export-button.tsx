"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrivacyAuditReport } from "@/lib/privacy/audit";

// Client-side JSON export of the already-rendered audit report — a legal /
// records-request artifact. No network round-trip: the report is serialized
// from the props the server component already computed.
export function ExportButton({ report }: { report: PrivacyAuditReport }) {
  const onExport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `privacy-audit-${report.generatedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={onExport}>
      <Download className="h-4 w-4" />
      Export JSON
    </Button>
  );
}
