import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

export type PushRegistration =
  | { ok: true; token: string }
  | {
      ok: false;
      reason:
        | "physical_device_required"
        | "permission_denied"
        | "eas_project_unconfigured";
    };

/**
 * Opt-in client half of push registration. Persisting a token deliberately
 * remains behind a future authenticated API/schema change and requires approval.
 */
export async function requestPushRegistration(): Promise<PushRegistration> {
  if (!Device.isDevice)
    return { ok: false, reason: "physical_device_required" };
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { ok: false, reason: "permission_denied" };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return { ok: false, reason: "eas_project_unconfigured" };
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return { ok: true, token: token.data };
}
