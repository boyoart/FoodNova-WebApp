import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Image } from "expo-image";

export function Logo({ size = 28, style }: { size?: number; inverse?: boolean; showTag?: boolean; style?: ViewStyle }) {
  return (
    <View style={[styles.wrap, { height: size + 18 }, style]}>
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
});
