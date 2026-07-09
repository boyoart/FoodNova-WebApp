import { useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { storage } from "@/src/utils/storage";
import { INTRO_SEEN_KEY } from "@/src/lib/constants";
import { Button } from "@/src/components/ui";
import { Logo } from "@/src/components/Logo";
import { colors, fonts, spacing, type } from "@/src/theme/tokens";

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
};

const SLIDES: Slide[] = [
  {
    icon: "flash",
    title: "Accept deliveries instantly",
    desc: "New delivery offers arrive in real time. Review the payout and route, then accept with a single tap.",
  },
  {
    icon: "navigate",
    title: "Navigate with live maps",
    desc: "Turn-by-turn routing from pickup to your customer, with live tracking shared to the FoodNova team.",
  },
  {
    icon: "wallet",
    title: "Earn and track everything",
    desc: "Watch your earnings grow, monitor your performance, and get paid for every completed delivery.",
  },
];

export default function Intro() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  async function finish() {
    await storage.setItem(INTRO_SEEN_KEY, true);
    router.replace("/(auth)/login");
  }

  function nextSlide() {
    if (isLast) {
      finish();
      return;
    }
    const n = index + 1;
    listRef.current?.scrollToOffset({ offset: n * width, animated: true });
    setIndex(n);
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Logo size={20} showTag={false} />
        <TouchableOpacity testID="intro-skip" onPress={finish} hitSlop={10}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        style={styles.list}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.art}>
              <View style={styles.artInner}>
                <Ionicons name={item.icon} size={96} color={colors.brandPrimary} />
              </View>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Button
          testID="intro-next"
          label={isLast ? "Get started" : "Next"}
          icon={isLast ? "arrow-forward" : undefined}
          onPress={nextSlide}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  list: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  skip: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.muted },
  slide: { paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  art: { width: "100%", aspectRatio: 1.1, maxHeight: 320, alignItems: "center", justifyContent: "center" },
  artInner: { width: 200, height: 200, borderRadius: 100, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: type["3xl"], fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  desc: { fontFamily: fonts.text, fontSize: type.lg, color: colors.muted, textAlign: "center", lineHeight: 24, paddingHorizontal: spacing.md },
  footer: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary },
  dotActive: { width: 24, backgroundColor: colors.brandPrimary },
});
