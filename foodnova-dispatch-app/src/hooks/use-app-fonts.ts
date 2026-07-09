import { useFonts } from "expo-font";

export function useAppFonts() {
  const [loaded, error] = useFonts({
    Poppins: require("../../assets/fonts/SpaceGrotesk.ttf"),
    Inter: require("../../assets/fonts/PlusJakartaSans.ttf"),
  });
  return [loaded, error] as const;
}
