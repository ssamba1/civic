import * as Location from "expo-location";
import type { Coordinates } from "../types";

// Matches Civic's current default reporting jurisdiction in submitReport.
export const CITY_CENTER: Coordinates = { lat: 19.0948, lng: 74.748 };

export async function captureLocation(): Promise<Coordinates | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  const last = await Location.getLastKnownPositionAsync({
    maxAge: 60_000,
    requiredAccuracy: 100,
  });
  const fix =
    last ??
    (await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }));
  const { latitude: lat, longitude: lng } = fix.coords;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0)
  )
    return null;
  return { lat, lng };
}
