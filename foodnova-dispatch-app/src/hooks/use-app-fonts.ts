import { useFonts } from "expo-font";

export function useAppFonts() {
  const [loaded, error] = useFonts({
    PlusJakartaSans: require("../../assets/fonts/PlusJakartaSans.ttf"),
  });
  return [loaded, error] as const;
}
