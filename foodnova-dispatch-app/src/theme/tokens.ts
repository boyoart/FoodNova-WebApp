// FoodNova Dispatch design tokens — derived from design_guidelines.json
// Brutalist / operational: high contrast, FoodNova Green signal color, no glass.

export const colors = {
  surface: "#FFFFFF",
  onSurface: "#1F2937",
  surfaceSecondary: "#F3F4F6",
  onSurfaceSecondary: "#111827",
  surfaceTertiary: "#E5E7EB",
  onSurfaceTertiary: "#374151",
  surfaceInverse: "#111827",
  onSurfaceInverse: "#FFFFFF",

  brand: "#00C261",
  brandPrimary: "#00C261",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#111827",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#D1FAE5",
  onBrandTertiary: "#065F46",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",

  border: "#E5E7EB",
  borderStrong: "#111827",
  divider: "#F3F4F6",

  muted: "#6B7280",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
};

// Font families registered in use-app-fonts.ts. Keep operational UI on a
// clean professional stack; avoid decorative/handwritten fonts in workflows.
export const fonts = {
  display: "Poppins",
  displayBold: "Poppins",
  text: "Inter",
};

export const type = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 40,
};
