import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Image } from "expo-image";

export function Logo({ size = 28, inverse = false, style }: { size?: number; inverse?: boolean; showTag?: boolean; style?: ViewStyle }) {
  return (
    <View style={[styles.wrap, inverse && styles.inverse, { height: size + 18 }, style]}>
      <Image
        source={require("../../assets/images/foodnova-dispatch-logo.png")}
        style={{ width: (size + 18) * (828 / 394), height: size + 18 }}
        contentFit="contain"
        contentPosition="left center"
        accessibilityLabel="FoodNova. Quality Foodstuff. Reliable Supply."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "center", backgroundColor: "transparent", alignSelf: "flex-start" },
  inverse: { backgroundColor: "transparent", alignSelf: "flex-start" },
});
