import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Image } from "expo-image";

export function Logo({ size = 28, inverse = false, style }: { size?: number; inverse?: boolean; showTag?: boolean; style?: ViewStyle }) {
  return (
    <View style={[styles.wrap, inverse && styles.inverse, { height: size + 18 }, style]}>
      <Image
        source={require("../../assets/images/foodnova-dispatch-logo.png")}
        style={{ width: (size + 18) * 3.2, height: size + 18 }}
        contentFit="contain"
        contentPosition="left center"
        accessibilityLabel="FoodNova Dispatch"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "center", overflow: "hidden" },
  inverse: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 10, paddingHorizontal: 8, alignSelf: "flex-start" },
});
