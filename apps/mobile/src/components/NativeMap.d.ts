import type { Coordinates, ReportSummary } from "../types";

export function NativeMap(props: {
  selected?: Coordinates | null;
  reports?: ReportSummary[];
  onSelect?: (coordinates: Coordinates) => void;
}): React.JSX.Element;
