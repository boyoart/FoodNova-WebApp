import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

export type PickedImage = { uri: string; name: string; type: string; size?: number | null };

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export async function pickImage(fromCamera = false): Promise<PickedImage | null> {
  if (fromCamera && Platform.OS !== "web") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== "web") return null;
  }

  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: true })
    : await ImagePicker.launchImageLibraryAsync({
        quality: 0.6,
        mediaTypes: ["images"],
        allowsEditing: true,
      });

  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  const name = a.fileName || `upload_${Date.now()}.jpg`;
  const type = a.mimeType || "image/jpeg";
  return { uri: a.uri, name, type, size: a.fileSize ?? null };
}

export function toFormData(img: PickedImage, field: string, extra?: Record<string, string>) {
  const form = new FormData();
  // On web the uri is a blob/data URL; fetch->blob is needed. RN accepts the object form.
  form.append(field, { uri: img.uri, name: img.name, type: img.type } as any);
  if (extra) Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  return form;
}

export function validateImageUpload(
  img: PickedImage | null,
  label: string,
  maxBytes = 5 * 1024 * 1024
): string | null {
  if (!img) return `${label} is required.`;
  if (!IMAGE_TYPES.has(img.type.toLowerCase())) {
    return `${label} must be a JPG, PNG, or WebP image.`;
  }
  if (img.size && img.size > maxBytes) {
    return `${label} must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  }
  return null;
}
