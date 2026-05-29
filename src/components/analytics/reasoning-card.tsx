"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ReasoningSection } from "@/app/api/ai/reasoning/route";

interface ReasoningData {
  reportId: string;
  reasoning: string;
  costBreakdown: ReasoningSection[];
  scoringExplanation: ReasoningSection[];
}

interface ReasoningCardProps {
  reportId: string;
  className?: string;
}

type TabType = "cost" | "scoring";

function SectionList({ sections }: { sections: ReasoningSection[] }) {
  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {section.title}
          </span>
          <p className="text-[13px] text-zinc-300 leading-relaxed">
            {section.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ReasoningCard({ reportId, className }: ReasoningCardProps) {
  const [data, setData] = useState<ReasoningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("cost");

  useEffect(() => {
    const fetchReasoning = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/ai/reasoning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch reasoning: ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchReasoning();
  }, [reportId]);

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-xl bg-[#1c1c1e] border border-white/[0.06] p-4 flex items-center justify-center",
          "h-40",
          className
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className={cn(
          "rounded-xl bg-[#1c1c1e] border border-white/[0.06] p-4",
          className
        )}
      >
        <p className="text-sm text-red-400">
          {error || "Failed to load reasoning"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl bg-[#1c1c1e] border border-white/[0.06] p-4 flex flex-col h-full",
        className
      )}
    >
      <h3 className="text-[15px] font-semibold text-white mb-3">Reasoning</h3>

      <div className="flex gap-2 mb-3 border-b border-white/[0.06]">
        <button
          onClick={() => setActiveTab("cost")}
          className={cn(
            "px-3 py-2 text-[13px] font-medium transition-colors relative",
            activeTab === "cost"
              ? "text-white"
              : "text-zinc-400 hover:text-zinc-300"
          )}
        >
          Cost
          {activeTab === "cost" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/[0.8]" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("scoring")}
          className={cn(
            "px-3 py-2 text-[13px] font-medium transition-colors relative",
            activeTab === "scoring"
              ? "text-white"
              : "text-zinc-400 hover:text-zinc-300"
          )}
        >
          Scoring
          {activeTab === "scoring" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/[0.8]" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "cost" && (
          <SectionList sections={data.costBreakdown} />
        )}
        {activeTab === "scoring" && (
          <SectionList sections={data.scoringExplanation} />
        )}
      </div>
    </div>
  );
}
