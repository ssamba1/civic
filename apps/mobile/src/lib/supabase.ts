import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { config } from "../config";

const secureStorage = {
  getItem: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
      : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    Platform.OS === "web"
      ? Promise.resolve(globalThis.localStorage?.setItem(key, value))
      : SecureStore.setItemAsync(key, value),
  removeItem: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(globalThis.localStorage?.removeItem(key))
      : SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
