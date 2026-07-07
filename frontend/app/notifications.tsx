import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { NotifApi } from "@/src/api/endpoints";
import { useToast } from "@/src/context/ToastContext";
import { EmptyState, Loader } from "@/src/components/ui";
import { asList, pick } from "@/src/lib/normalize";
import { timeAgo } from "@/src/lib/format";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  const t = (type || "").toLowerCase();
  if (t.includes("offer") || t.includes("delivery")) return "flash";
  if (t.includes("assign")) return "cube";
  if (t.includes("approv") || t.includes("verif")) return "shield-checkmark";
  if (t.includes("announce") || t.includes("broadcast")) return "megaphone";
  return "notifications";
}

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await NotifApi.list();
      setItems(asList(data));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function markAll() {
    try {
      await NotifApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true, is_read: true })));
      toast.show("All marked as read", "success");
    } catch {}
  }

  async function openItem(item: any) {
    const id = pick(item, ["id", "_id", "notification_id"], "");
    if (id) NotifApi.markRead(String(id)).catch(() => {});
    const orderId = pick(item, ["order_id", "data.order_id", "metadata.order_id"], null);
    if (orderId) router.push(`/delivery/${orderId}`);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="notif-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity testID="mark-all-read" onPress={markAll} style={styles.iconBtn}>
          <Ionicons name="checkmark-done" size={22} color={colors.brandPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <Loader label="Loading…" />
      ) : items.length === 0 ? (
        <EmptyState testID="notif-empty" icon="notifications-outline" title="No notifications" subtitle="You're all caught up!" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(pick(item, ["id", "_id"], i))}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const unread = !pick(item, ["read", "is_read"], false);
            const ntype = pick(item, ["type", "category", "notification_type"], "");
            return (
              <TouchableOpacity testID="notif-item" activeOpacity={0.8} onPress={() => openItem(item)} style={[styles.item, unread && styles.itemUnread]}>
                <View style={[styles.itemIcon, unread && { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name={iconFor(ntype)} size={20} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {pick(item, ["title", "heading", "subject"], "Notification")}
                  </Text>
                  <Text style={styles.itemBody} numberOfLines={2}>
                    {pick(item, ["body", "message", "content", "text"], "")}
                  </Text>
                  <Text style={styles.itemTime}>{timeAgo(pick(item, ["created_at", "timestamp", "sent_at"], null))}</Text>
                </View>
                {unread && <View style={styles.dot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingHorizontal: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: type.lg, fontWeight: "700", color: colors.onSurface },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing["3xl"] },
  item: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  itemUnread: { borderColor: colors.brandPrimary },
  itemIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  itemTitle: { fontFamily: fonts.display, fontSize: type.base, fontWeight: "700", color: colors.onSurface },
  itemBody: { fontFamily: fonts.text, fontSize: type.sm, color: colors.onSurfaceTertiary, marginTop: 2, lineHeight: 18 },
  itemTime: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary, marginTop: 4 },
});
