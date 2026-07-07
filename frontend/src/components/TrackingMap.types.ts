import type { ViewStyle } from "react-native";

export type LatLng = { latitude: number; longitude: number };

export type TrackingMapProps = {
  rider?: LatLng | null;
  pickup?: LatLng | null;
  customer?: LatLng | null;
  style?: ViewStyle;
};
