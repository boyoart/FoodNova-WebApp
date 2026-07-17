import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";
import { statusMeta } from "@/src/lib/format";

/* ----------------------------- Button ----------------------------- */
type BtnVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary"
      ? colors.brandPrimary
      : variant === "secondary"
      ? colors.surfaceInverse
      : variant === "danger"
      ? colors.error
      : "transparent";
  const fg =
    variant === "outline" || variant === "ghost" ? colors.onSurface : colors.onBrandPrimary;
  const border =
    variant === "outline" ? colors.borderStrong : "transparent";

  return (
    <Pressable
      testID={testID}
      disabled={isDisabled}
      onPress={() => {
        if (isDisabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === "outline" ? 2 : 0 },
        pressed && !isDisabled && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon && <Ionicons name={icon} size={20} color={fg} />}
          <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ----------------------------- Card ----------------------------- */
export function Card({
  children,
  style,
  inverse,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  inverse?: boolean;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        inverse && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ----------------------------- StatusPill ----------------------------- */
export function StatusPill({ status, testID }: { status?: string | null; testID?: string }) {
  const { label, tone } = statusMeta(status);
  const map = {
    brand: [colors.brandTertiary, colors.onBrandTertiary],
    success: ["#D1FAE5", "#065F46"],
    warning: ["#FEF3C7", "#92400E"],
    error: ["#FEE2E2", "#991B1B"],
    muted: [colors.surfaceTertiary, colors.onSurfaceTertiary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/* ----------------------------- Field ----------------------------- */
export function Field({
  label,
  error,
  testID,
  ...props
}: TextInputProps & { label?: string; error?: string; testID?: string }) {
  return (
    <View style={{ gap: spacing.xs }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? { borderColor: colors.error } : null]}
        {...props}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

/* ----------------------------- Section header ----------------------------- */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

/* ----------------------------- Empty / Loader ----------------------------- */
export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
      {label ? <Text style={styles.muted}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = "cube-outline",
  title,
  subtitle,
  testID,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  testID?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View testID={testID} style={styles.center}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={34} color={colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} variant="outline" onPress={onAction} /> : null}
    </View>
  );
}

/* ----------------------------- Row (key/value) ----------------------------- */
export function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        {icon && <Ionicons name={icon} size={18} color={colors.muted} />}
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value ?? "--"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnLabel: { fontFamily: fonts.display, fontSize: type.lg, fontWeight: "700" },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "700" },
  label: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurfaceTertiary },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontFamily: fonts.text,
    fontSize: type.lg,
    color: colors.onSurface,
  },
  errorText: { color: colors.error, fontFamily: fonts.text, fontSize: type.sm },
  section: {
    fontFamily: fonts.display,
    fontSize: type.lg,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  muted: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, textAlign: "center" },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: type.lg, fontWeight: "700", color: colors.onSurface },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  infoLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  infoLabel: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  infoValue: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurface, flexShrink: 1, textAlign: "right" },
});
