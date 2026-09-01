import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Coordinates, ReportSummary } from "../types";

export function NativeMap({
  selected,
  reports = [],
  onSelect,
}: {
  selected?: Coordinates | null;
  reports?: ReportSummary[];
  onSelect?: (coordinates: Coordinates) => void;
}) {
  return (
    <Pressable
      accessibilityRole={onSelect ? "button" : undefined}
      accessibilityLabel="Native map preview"
      onPress={() => onSelect?.({ lat: 19.0948, lng: 74.748 })}
      style={styles.map}
    >
      <View style={styles.cityBlock} />
      <Text style={styles.title}>Civic city map</Text>
      <Text style={styles.copy}>
        {onSelect
          ? selected
            ? "Location selected. Continue below."
            : "Click to simulate a map-tap location."
          : `${reports.length} recent reports · interactive native map on iOS and Android`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#DCE6FA",
    padding: 24,
  },
  cityBlock: {
    position: "absolute",
    width: 220,
    height: 86,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 12,
    borderColor: "#AFC4EF",
    transform: [{ rotate: "-8deg" }],
  },
  title: { color: "#10182C", fontSize: 22, fontWeight: "800" },
  copy: { color: "#42506A", textAlign: "center", marginTop: 8, maxWidth: 300 },
});
