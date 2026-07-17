import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

import { RiderApi } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { Button, Card, InfoRow, StatusPill } from "@/src/components/ui";
import { asObject, pick } from "@/src/lib/normalize";
import { colors, fonts, spacing, type } from "@/src/theme/tokens";
import { BUILD_IDENTITY } from "@/src/lib/build-identity";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rider, refreshRider, signOut, approvalStatus } = useAuth();
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [notifPref, setNotifPref] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await RiderApi.profile();
      setProfile(asObject(data, "profile", "worker", "rider", "data"));
    } catch {
      setProfile(rider || {});
    }
  }, [rider]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshRider();
    }, [load, refreshRider])
  );

  const p = { ...(rider || {}), ...profile };
  const name = pick(p, ["full_name", "name", "first_name"], "Rider");
  const phone = pick(p, ["phone", "phone_number"], "--");
  const email = pick(p, ["email"], "--");
  const photo = pick(p, ["profile_photo", "photo_url", "avatar", "selfie_url"], null);
  const vehicleType = pick(p, ["vehicle_type", "rider_type"], "--");
  const plate = pick(p, ["plate_number", "plate"], "--");
  const make = pick(p, ["vehicle_make"], "");
  const model = pick(p, ["vehicle_model"], "");

  function onSignOut() {
    signOut();
    router.replace("/(auth)/login");
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <Card style={styles.idCard}>
          <View style={styles.avatar}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Text style={styles.avatarInitial}>{String(name).charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.name}>{String(name)}</Text>
          <StatusPill status={approvalStatus || "active"} testID="profile-status" />
        </Card>

        {/* Contact */}
        <Text style={styles.section}>Contact</Text>
        <Card>
          <InfoRow label="Phone" value={String(phone)} icon="call-outline" />
          <InfoRow label="Email" value={String(email)} icon="mail-outline" />
        </Card>

        {/* Vehicle */}
        <Text style={styles.section}>Vehicle</Text>
        <Card>
          <InfoRow label="Type" value={String(vehicleType)} icon="bicycle-outline" />
          <InfoRow label="Make / Model" value={`${make || "--"}${model ? ` ${model}` : ""}`} icon="construct-outline" />
          <InfoRow label="Plate number" value={String(plate)} icon="card-outline" />
        </Card>

        {/* Documents */}
        <Text style={styles.section}>Verification</Text>
        <Card>
          <InfoRow label="NIN verified" value={pick(p, ["nin_verified"], false) ? "Yes" : "On file"} icon="finger-print-outline" />
          <InfoRow label="Selfie" value={photo ? "Uploaded" : "—"} icon="happy-outline" />
          <InfoRow label="Proof of address" value={pick(p, ["address_verified"], false) ? "Verified" : "On file"} icon="document-text-outline" />
        </Card>

        {/* Settings */}
        <Text style={styles.section}>Settings</Text>
        <Card style={{ paddingVertical: spacing.xs }}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={20} color={colors.onSurfaceTertiary} />
              <Text style={styles.settingLabel}>Push notifications</Text>
            </View>
            <Switch
              testID="notif-switch"
              value={notifPref}
              onValueChange={setNotifPref}
              trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity testID="support-row" style={styles.settingRow} onPress={() => Linking.openURL("mailto:support@foodnova.com")}>
            <View style={styles.settingLeft}>
              <Ionicons name="help-buoy-outline" size={20} color={colors.onSurfaceTertiary} />
              <Text style={styles.settingLabel}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </TouchableOpacity>
        </Card>

        <Text style={styles.section}>Build identity</Text>
        <Card testID="build-identity-card">
          <InfoRow label="Version" value={`${BUILD_IDENTITY.appVersion} (${BUILD_IDENTITY.buildNumber})`} icon="layers-outline" />
          <InfoRow label="Commit" value={BUILD_IDENTITY.commit} icon="git-commit-outline" />
          <InfoRow label="Built" value={BUILD_IDENTITY.buildDate} icon="calendar-outline" />
          <InfoRow label="Environment" value={BUILD_IDENTITY.environment} icon="server-outline" />
          <InfoRow label="API" value={BUILD_IDENTITY.apiBaseUrl} icon="cloud-outline" />
          <InfoRow label="Application ID" value={BUILD_IDENTITY.applicationId} icon="phone-portrait-outline" />
        </Card>

        <Button testID="signout-button" label="Log out" variant="outline" icon="log-out-outline" onPress={onSignOut} />
        <Text style={styles.version}>FoodNova Dispatch · v{BUILD_IDENTITY.appVersion}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface },
  body: { padding: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.md },
  idCard: { alignItems: "center", gap: spacing.md },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { fontFamily: fonts.display, fontSize: type["3xl"], fontWeight: "700", color: colors.onBrandTertiary },
  name: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface },
  section: { fontFamily: fonts.display, fontSize: type.base, fontWeight: "700", color: colors.muted, marginTop: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  settingLabel: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurface },
  version: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, textAlign: "center", marginTop: spacing.md },
});
