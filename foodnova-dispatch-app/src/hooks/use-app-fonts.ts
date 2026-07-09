import { useFonts } from "expo-font";

export function useAppFonts() {
  const [loaded, error] = useFonts({
    SpaceGrotesk: require("../../assets/fonts/SpaceGrotesk.ttf"),
    PlusJakartaSans: require("../../assets/fonts/PlusJakartaSans.ttf"),
  });
  return [loaded, error] as const;
}
