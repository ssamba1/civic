import type { Session } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { NativeMap } from "./src/components/NativeMap";
import { config } from "./src/config";
import {
  loadAssignedWork,
  loadCommunityReports,
  loadMyReports,
  syncReport,
} from "./src/lib/api";
import { captureLocation } from "./src/lib/location";
import { processPhotoOnDevice } from "./src/lib/privacy";
import { SQLiteQueueStore } from "./src/lib/queue-store";
import { supabase } from "./src/lib/supabase";
import { flushQueue } from "./src/lib/sync";
import { dark, light } from "./src/theme";
import type {
  AssignedWork,
  Coordinates,
  QueuedReport,
  ReportSummary,
} from "./src/types";

type Tab = "report" | "map" | "history" | "work";
type SelectedPhoto = { uri: string; width: number; height: number };
const store = new SQLiteQueueStore();

function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const colors = useColorScheme() === "dark" ? dark : light;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && {
          backgroundColor: colors.surface,
          borderColor: colors.primary,
          borderWidth: 1,
        },
        (disabled || pressed) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AuthScreen() {
  const colors = useColorScheme() === "dark" ? dark : light;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function authenticate(signUp: boolean) {
    if (!email.trim().includes("@")) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = signUp
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
      if (result.error) setMessage(result.error.message);
      else if (signUp && !result.data.session)
        setMessage("Check your email to confirm your account.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sign-in is unavailable. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={[styles.full, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.center}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          RESIDENT REPORTING · PUBLIC WORKS
        </Text>
        <Text style={[styles.brand, { color: colors.text }]}>Civic</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Photograph a city issue. Civic turns it into accountable work.
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.label, { color: colors.text }]}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border },
            ]}
          />
          <Text style={[styles.label, { color: colors.text }]}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border },
            ]}
          />
          {message && (
            <Text accessibilityRole="alert" style={{ color: colors.danger }}>
              {message}
            </Text>
          )}
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Button
                label="Sign in"
                onPress={() => void authenticate(false)}
              />
              <Button
                secondary
                label="Create account"
                onPress={() => void authenticate(true)}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ReportScreen({
  onQueued,
  ownerId,
}: {
  onQueued: () => void;
  ownerId: string;
}) {
  const colors = useColorScheme() === "dark" ? dark : light;
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [mapFallback, setMapFallback] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (!mapFallback || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setMapFallback(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [mapFallback]);
  async function choose(camera: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          camera
            ? "Allow camera access to photograph the infrastructure issue."
            : "Allow photo access to choose an infrastructure issue image.",
        );
        return;
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
          });
      if (!result.canceled) {
        const asset = result.assets[0];
        setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
        // Record the observation when the resident captures/selects evidence,
        // rather than when they eventually finish and enqueue the form.
        setCapturedAt(new Date().toISOString());
      }
    } catch (error) {
      Alert.alert(
        "Photo unavailable",
        error instanceof Error
          ? error.message
          : "Try choosing the photo again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function locate() {
    if (busy) return;
    setBusy(true);
    const fix = await captureLocation().catch(() => null);
    setBusy(false);
    if (fix) setLocation(fix);
    else setMapFallback(true);
  }
  async function submit() {
    if (submitting.current) return;
    if (!photo || !location)
      return Alert.alert(
        "Report incomplete",
        "Add a photo and choose the issue location.",
      );
    if (isEmergency)
      return Alert.alert(
        "Call emergency services",
        "Civic does not dispatch emergency responders. Call 911 for immediate danger to life or traffic.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Call 911", onPress: () => void Linking.openURL("tel:911") },
        ],
      );
    submitting.current = true;
    setBusy(true);
    const id = Crypto.randomUUID();
    const occurredAt = capturedAt ?? new Date().toISOString();
    try {
      const processed = await processPhotoOnDevice(photo.uri, id, photo);
      const report: QueuedReport = {
        id,
        ownerId,
        occurredAt,
        publicPhotoUri: processed.publicUri,
        rawPhotoUri: processed.rawUri,
        location,
        address: null,
        description: description.trim() || null,
        issueType: null,
        tags: [],
        attempts: 0,
        lastError: null,
        status: "pending",
      };
      await store.put(report);
      setPhoto(null);
      setCapturedAt(null);
      setDescription("");
      setLocation(null);
      setIsEmergency(false);
      onQueued();
      Alert.alert(
        "Saved on this phone",
        "Your report is safe. Civic will send it exactly once when a connection is available.",
      );
    } catch (error) {
      Alert.alert(
        "Could not save report",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (mapFallback)
    return (
      <View style={[styles.full, styles.mapFallback]}>
        <Text style={[styles.title, { color: colors.text }]}>
          Tap the issue location
        </Text>
        <NativeMap selected={location} onSelect={setLocation} />
        <Button
          label="Use this location"
          disabled={!location}
          onPress={() => setMapFallback(false)}
        />
        <Button
          secondary
          label="Cancel"
          onPress={() => setMapFallback(false)}
        />
      </View>
    );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.full}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          NEW REPORT
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          What did you find?
        </Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          The observation time is recorded now, even if delivery happens later.
        </Text>
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            style={styles.preview}
            accessibilityLabel="Selected infrastructure issue photo"
          />
        ) : (
          <View style={[styles.photoEmpty, { borderColor: colors.border }]}>
            <Text style={{ color: colors.muted }}>No photo selected</Text>
          </View>
        )}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              label="Take photo"
              disabled={busy}
              onPress={() => void choose(true)}
            />
          </View>
          <View style={styles.flex}>
            <Button
              secondary
              label="Photo library"
              disabled={busy}
              onPress={() => void choose(false)}
            />
          </View>
        </View>
        <Text style={[styles.label, { color: colors.text }]}>
          What should public works know?
        </Text>
        <TextInput
          accessibilityLabel="Issue description"
          multiline
          maxLength={500}
          placeholder="Large pothole in the right lane near…"
          placeholderTextColor={colors.muted}
          value={description}
          onChangeText={setDescription}
          style={[
            styles.input,
            styles.textarea,
            { color: colors.text, borderColor: colors.border },
          ]}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isEmergency }}
          accessibilityLabel="This is an immediate emergency"
          onPress={() => setIsEmergency((current) => !current)}
          style={styles.emergencyRow}
        >
          <View
            style={[
              styles.checkbox,
              { borderColor: isEmergency ? colors.danger : colors.border },
              isEmergency && { backgroundColor: colors.danger },
            ]}
          >
            {isEmergency && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: colors.text }]}>
              Immediate danger?
            </Text>
            <Text style={{ color: colors.muted }}>
              Civic is not an emergency service. Selecting this blocks
              submission and offers a one-tap 911 call.
            </Text>
          </View>
        </Pressable>
        <Button
          secondary
          label={
            location ? "Location captured ✓" : "Capture GPS or choose on map"
          }
          onPress={() => void locate()}
          disabled={busy}
        />
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Button label="Save report" onPress={() => void submit()} />
        )}
        <Text style={[styles.privacy, { color: colors.muted }]}>
          Privacy: sensitive areas are blurred on this device before the public
          copy can leave your phone. The normalized original is sent only to
          restricted city storage with a 30-day retention policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ReportList({
  reports,
  pending,
  onRetry,
}: {
  reports: ReportSummary[];
  pending?: QueuedReport[];
  onRetry?: (id: string) => void;
}) {
  const colors = useColorScheme() === "dark" ? dark : light;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Report history</Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Saved reports appear here immediately and retain their original
        observation time while waiting for a connection.
      </Text>
      {pending?.map((report) => (
        <View
          key={report.id}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.badge, { color: colors.accent }]}>
            WAITING TO SYNC
          </Text>
          <Image
            source={{ uri: report.publicPhotoUri }}
            style={styles.thumb}
            accessibilityLabel="Privacy-processed issue photo waiting to sync"
          />
          <Text style={{ color: colors.text }}>
            {report.description ?? "Infrastructure issue report"}
          </Text>
          <Text style={{ color: colors.muted }}>
            {new Date(report.occurredAt).toLocaleString()}
          </Text>
          {report.lastError && (
            <Text style={{ color: colors.danger }}>{report.lastError}</Text>
          )}
          {report.status === "failed" && onRetry && (
            <Button label="Retry sync" onPress={() => onRetry(report.id)} />
          )}
        </View>
      ))}
      {reports.map((report) => (
        <View
          key={report.id}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {report.photo_public_url && (
            <Image
              source={{ uri: report.photo_public_url }}
              style={styles.thumb}
            />
          )}
          <Text style={[styles.badge, { color: colors.primary }]}>
            {report.status.toUpperCase()}
          </Text>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {report.category?.replaceAll("_", " ") ?? "Hazard being classified"}
          </Text>
          <Text style={{ color: colors.muted }}>
            {report.address ?? new Date(report.created_at).toLocaleString()}
          </Text>
        </View>
      ))}
      {!pending?.length && !reports.length && (
        <Text style={{ color: colors.muted }}>No reports yet.</Text>
      )}
    </ScrollView>
  );
}

function CommunityMap({ reports }: { reports: ReportSummary[] }) {
  const colors = useColorScheme() === "dark" ? dark : light;
  return (
    <View style={styles.full}>
      <View style={styles.mapHeader}>
        <Text style={[styles.title, { color: colors.text }]}>
          Community issue map
        </Text>
        <Text style={{ color: colors.muted }}>
          Recent public reports · precise resident identity is never shown
        </Text>
      </View>
      <NativeMap reports={reports} />
    </View>
  );
}

function AssignedWorkList({ work }: { work: AssignedWork[] }) {
  const colors = useColorScheme() === "dark" ? dark : light;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>
        Assigned crew work
      </Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Operational work orders only. Employee contact information is never
        shown.
      </Text>
      {work.map((item) => (
        <View
          key={item.id}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.badge, { color: colors.accent }]}>
            {item.crewName.toUpperCase()}
          </Text>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {item.category.replaceAll("_", " ")}
          </Text>
          <Text style={{ color: colors.muted }}>
            {item.address ?? "Location available in report"}
          </Text>
          <Text style={{ color: colors.primary }}>
            {item.status.replaceAll("_", " ")}
          </Text>
        </View>
      ))}
      {work.length === 0 && (
        <Text style={{ color: colors.muted }}>
          No work is currently assigned to your crews.
        </Text>
      )}
    </ScrollView>
  );
}

function AppShell({
  ownerId,
  isAnonymous,
}: {
  ownerId: string;
  isAnonymous: boolean;
}) {
  const colors = useColorScheme() === "dark" ? dark : light;
  const [tab, setTab] = useState<Tab>("report");
  const [pending, setPending] = useState<QueuedReport[]>([]);
  const [mine, setMine] = useState<ReportSummary[]>([]);
  const [community, setCommunity] = useState<ReportSummary[]>([]);
  const [assignedWork, setAssignedWork] = useState<AssignedWork[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(!config.previewMode);
  const handleAccountPress = useCallback(() => {
    if (pending.length > 0) {
      Alert.alert(
        "Reports waiting to sync",
        "Keep this resident session until every saved report has synchronized. Your reports remain safe on this device.",
      );
      return;
    }
    void supabase.auth.signOut();
  }, [pending.length]);
  const refresh = useCallback(async () => {
    setLoadingData(true);
    try {
      await store.init();
      setPending(await store.list(ownerId));
      if (config.previewMode) return;
      const results = await Promise.allSettled([
        loadMyReports(),
        loadCommunityReports(),
        loadAssignedWork(),
      ]);
      if (results[0].status === "fulfilled") setMine(results[0].value);
      if (results[1].status === "fulfilled") setCommunity(results[1].value);
      if (results[2].status === "fulfilled") setAssignedWork(results[2].value);
      setDataError(
        results.some((result) => result.status === "rejected")
          ? "Some live information could not be refreshed. Saved offline reports are still safe."
          : null,
      );
    } catch {
      setDataError(
        "Saved reports could not be read from this device. Restart Civic and try again.",
      );
    } finally {
      setLoadingData(false);
    }
  }, [ownerId]);
  const sync = useCallback(async () => {
    if (config.previewMode) return;
    try {
      const state = await Network.getNetworkStateAsync();
      if (!state.isConnected || state.isInternetReachable === false) return;
      const summary = await flushQueue(
        store,
        (payload) => syncReport(payload, ownerId),
        undefined,
        ownerId,
      );
      if (summary.failed > 0)
        setDataError(
          "A saved report could not sync. Open History to retry it.",
        );
      await refresh();
    } catch {
      setDataError(
        "Synchronization is unavailable right now. Saved reports remain on this device.",
      );
    }
  }, [refresh, ownerId]);
  useEffect(() => {
    void refresh().catch(() => undefined);
    void sync();
    const subscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void sync();
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void sync();
      },
    );
    return () => {
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [refresh, sync]);
  const view =
    tab === "report" ? (
      <ReportScreen
        ownerId={ownerId}
        onQueued={() => {
          void store.list(ownerId).then(setPending);
          void sync();
        }}
      />
    ) : tab === "map" ? (
      <CommunityMap reports={community} />
    ) : tab === "history" ? (
      <ReportList
        reports={mine}
        pending={pending}
        onRetry={(id) => {
          void store
            .retry(id)
            .then(sync)
            .catch(() =>
              setDataError("This saved report could not be reset for retry."),
            );
        }}
      />
    ) : (
      <AssignedWorkList work={assignedWork} />
    );
  return (
    <SafeAreaView style={[styles.full, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerBrand, { color: colors.text }]}>Civic</Text>
        {!config.previewMode && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isAnonymous ? "Sign in to Civic" : "Sign out"}
            onPress={handleAccountPress}
            style={styles.touch}
          >
            <Text style={{ color: colors.primary }}>
              {isAnonymous ? "Sign in" : "Sign out"}
            </Text>
          </Pressable>
        )}
      </View>
      {dataError && (
        <View
          accessibilityRole="alert"
          style={[styles.banner, { backgroundColor: colors.surface }]}
        >
          <Text style={{ color: colors.danger, flex: 1 }}>{dataError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading live information"
            onPress={() => void refresh()}
            style={styles.touch}
          >
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              Retry
            </Text>
          </Pressable>
        </View>
      )}
      {loadingData && <ActivityIndicator color={colors.primary} />}
      <View style={styles.flex}>{view}</View>
      <View
        style={[
          styles.tabs,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {(["report", "map", "history", "work"] as Tab[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item }}
            onPress={() => setTab(item)}
            style={styles.tab}
          >
            <Text
              style={{
                color: tab === item ? colors.primary : colors.muted,
                fontWeight: tab === item ? "700" : "500",
              }}
            >
              {item === "report"
                ? "Report"
                : item === "map"
                  ? "Map"
                  : item === "history"
                    ? `History${pending.length ? ` (${pending.length})` : ""}`
                    : "Assigned"}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (data.session || config.previewMode) {
          setSession(data.session);
          return;
        }
        const anonymous = await supabase.auth.signInAnonymously();
        setSession(anonymous.data.session);
      })
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") supabase.auth.startAutoRefresh();
        else supabase.auth.stopAutoRefresh();
      },
    );
    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    return () => {
      data.subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);
  if (!ready)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {session || config.previewMode ? (
        <AppShell
          ownerId={session?.user.id ?? "preview-local"}
          isAnonymous={session?.user.is_anonymous ?? false}
        />
      ) : (
        <AuthScreen />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  header: {
    minHeight: 52,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBrand: { fontSize: 22, fontWeight: "800" },
  touch: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  eyebrow: { fontSize: 12, letterSpacing: 1.6, fontWeight: "800" },
  brand: { fontSize: 42, fontWeight: "900", letterSpacing: -1 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  lead: { fontSize: 16, lineHeight: 23 },
  label: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: "700", textTransform: "capitalize" },
  badge: { fontSize: 11, letterSpacing: 1, fontWeight: "800" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  textarea: { minHeight: 100, paddingTop: 12, textAlignVertical: "top" },
  button: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#356AE6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10 },
  preview: { height: 230, borderRadius: 18, resizeMode: "cover" },
  thumb: { width: "100%", height: 140, borderRadius: 12 },
  photoEmpty: {
    height: 180,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  privacy: { fontSize: 13, lineHeight: 19 },
  emergencyRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkbox: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  map: { flex: 1, minHeight: 320 },
  mapHeader: { padding: 20, gap: 4 },
  mapFallback: { padding: 20, gap: 12 },
  banner: {
    minHeight: 48,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tabs: { minHeight: 64, flexDirection: "row", borderTopWidth: 1 },
  tab: {
    flex: 1,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
});
