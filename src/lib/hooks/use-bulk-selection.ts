/**
 * useBulkSelection — manages row-checkbox selection state for a list of items.
 *
 * Pure hook: no server calls, no side effects beyond useState.
 * Suitable for colocating tests or importing in server-component pages (will
 * only be used by client-component descendants).
 */

import { useCallback, useMemo, useState } from "react";

export interface UseBulkSelectionOptions {
  /**
   * All selectable item IDs.  Providing this enables select-all / select-none.
   */
  allIds?: string[];
}

export interface UseBulkSelectionReturn {
  /** Currently selected IDs (stable reference when unchanged) */
  selectedIds: string[];
  /** Number of selected IDs */
  selectedCount: number;
  /** True when at least one item is selected */
  hasSelection: boolean;
  /** True when every item in allIds is selected */
  isAllSelected: boolean;
  /** True when some (but not all) items are selected — for indeterminate checkbox */
  isIndeterminate: boolean;
  /** Toggle a single ID in/out of the selection */
  toggle: (id: string) => void;
  /** Select all IDs from allIds (no-op if allIds not provided) */
  selectAll: () => void;
  /** Deselect everything */
  clear: () => void;
  /** Replace the entire selection */
  setSelected: (ids: string[]) => void;
  /** Returns true if the given id is selected */
  isSelected: (id: string) => boolean;
}

export function useBulkSelection(
  opts: UseBulkSelectionOptions = {},
): UseBulkSelectionReturn {
  const { allIds = [] } = opts;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (allIds.length > 0) {
      setSelected(new Set(allIds));
    }
  }, [allIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const setSelectedIds = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const isAllSelected =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  const isIndeterminate = selected.size > 0 && !isAllSelected;

  return {
    selectedIds,
    selectedCount: selected.size,
    hasSelection: selected.size > 0,
    isAllSelected,
    isIndeterminate,
    toggle,
    selectAll,
    clear,
    setSelected: setSelectedIds,
    isSelected,
  };
}
