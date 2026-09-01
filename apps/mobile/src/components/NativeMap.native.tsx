import MapView, { type MapPressEvent, Marker } from "react-native-maps";
import { CITY_CENTER } from "../lib/location";
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
    <MapView
      accessibilityLabel="Infrastructure issue location map"
      style={{ flex: 1, minHeight: 320 }}
      initialRegion={{
        latitude: CITY_CENTER.lat,
        longitude: CITY_CENTER.lng,
        latitudeDelta: 0.14,
        longitudeDelta: 0.14,
      }}
      onPress={
        onSelect
          ? (event: MapPressEvent) =>
              onSelect({
                lat: event.nativeEvent.coordinate.latitude,
                lng: event.nativeEvent.coordinate.longitude,
              })
          : undefined
      }
    >
      {selected && (
        <Marker
          coordinate={{ latitude: selected.lat, longitude: selected.lng }}
        />
      )}
      {reports.map((report) =>
        report.location ? (
          <Marker
            key={report.id}
            coordinate={{
              latitude: report.location.lat,
              longitude: report.location.lng,
            }}
            title={report.category ?? "Infrastructure issue"}
            description={report.status}
          />
        ) : null,
      )}
    </MapView>
  );
}
