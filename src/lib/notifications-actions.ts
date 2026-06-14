"use server";

import {
  getCurrentResident,
  getResidentNotifications,
  type NotificationItem,
} from "@/lib/resident-data";

export async function fetchResidentNotifications(): Promise<
  NotificationItem[]
> {
  const { citySlug } = await getCurrentResident();
  return getResidentNotifications(citySlug);
}
