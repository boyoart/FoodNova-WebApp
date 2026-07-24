import type { ViewStyle } from "react-native";

export type LatLng = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
};

export type TrackingMapProps = {
  rider?: LatLng | null;
  pickup?: LatLng | null;
  customer?: LatLng | null;
  status?: string | null;
  vehicleType?: string | null;
  style?: ViewStyle;
};
