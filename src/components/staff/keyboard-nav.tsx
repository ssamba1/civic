"use client";

import { useEffect, useCallback } from "react";
import { Keyboard } from "lucide-react";

interface KeyboardNavProps {
  totalItems: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  detailOpen: boolean;
  onOpenDetail: () => void;
  onCloseDetail: () => void;
  onDispatch: () => void;
  onClose: () => void;
  onReject: () => void;
}

export function KeyboardNav({
  totalItems,
  selectedIndex,
  onSelect,
  detailOpen,
  onOpenDetail,
  onCloseDetail,
  onDispatch,
  onClose,
  onReject,
}: KeyboardNavProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "j":
          e.preventDefault();
          onSelect(Math.min(selectedIndex + 1, totalItems - 1));
          break;
        case "k":
          e.preventDefault();
          onSelect(Math.max(selectedIndex - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (!detailOpen) onOpenDetail();
          break;
        case "Escape":
          e.preventDefault();
          if (detailOpen) onCloseDetail();
          break;
        case "d":
          if (detailOpen) {
            e.preventDefault();
            onDispatch();
          }
          break;
        case "c":
          if (detailOpen) {
            e.preventDefault();
            onClose();
          }
          break;
        case "r":
          if (detailOpen) {
            e.preventDefault();
            onReject();
          }
          break;
      }
    },
    [
      totalItems,
      selectedIndex,
      detailOpen,
      onSelect,
      onOpenDetail,
      onCloseDetail,
      onDispatch,
      onClose,
      onReject,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex items-center gap-4 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
      <Keyboard className="h-3.5 w-3.5" />
      <span className="font-medium">Shortcuts:</span>
      <div className="flex flex-wrap gap-3">
        <span>
          <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-600 dark:bg-zinc-800">
            j
          </kbd>{" "}
          /{" "}
          <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-600 dark:bg-zinc-800">
            k
          </kbd>{" "}
          navigate
        </span>
        <span>
          <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-600 dark:bg-zinc-800">
            Enter
          </kbd>{" "}
          open
        </span>
        <span>
          <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-600 dark:bg-zinc-800">
            Esc
          </kbd>{" "}
          close
        </span>
        <span>
          <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-600 dark:bg-zinc-800">
            d
          </kbd>{" "}
          dispatch
        </span>
        <span>
          <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-600 dark:bg-zinc-800">
            c
          </kbd>{" "}
          close order
        </span>
        <span>
          <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-600 dark:bg-zinc-800">
            r
          </kbd>{" "}
          reject
        </span>
      </div>
    </div>
  );
}
