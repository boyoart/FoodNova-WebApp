import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { RiderApi } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { ApiError } from "@/src/api/client";
import { Button, Field } from "@/src/components/ui";
import { pickImage, toFormData, PickedImage } from "@/src/lib/image";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

const STEPS = ["Identity", "Selfie", "Documents", "Vehicle", "Emergency", "Review"] as const;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { rider, signOut } = useAuth();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Identity
  const [nin, setNin] = useState("");
  const [consent, setConsent] = useState(false);
  const [ninVerified, setNinVerified] = useState(false);
  // Media
  const [selfie, setSelfie] = useState<PickedImage | null>(null);
  const [doc, setDoc] = useState<PickedImage | null>(null);
  // Vehicle
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  // Emergency
  const [ecName, setEcName] = useState("");
  const [ecRel, setEcRel] = useState("");
  const [ecPhone, setEcPhone] = useState("");

  const progress = useMemo(() => (step + 1) / STEPS.length, [step]);

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  }
  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function verifyNin() {
    if (nin.trim().length !== 11) {
      toast.show("NIN must be 11 digits", "warning");
      return;
    }
    if (!consent) {
      toast.show("Please accept the NIN verification consent", "warning");
      return;
    }
    setLoading(true);
    try {
      await RiderApi.verifyNin(nin.trim());
      setNinVerified(true);
      toast.show("NIN verified successfully", "success");
      next();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "NIN verification failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function uploadSelfie() {
    if (!selfie) {
      toast.show("Please add a selfie first", "warning");
      return;
    }
    setLoading(true);
    try {
      await RiderApi.uploadSelfie(toFormData(selfie, "document"));
      toast.show("Selfie uploaded", "success");
      next();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function uploadDoc() {
    if (!doc) {
      toast.show("Please add your utility bill", "warning");
      return;
    }
    setLoading(true);
    try {
      await RiderApi.uploadDocument(toFormData(doc, "document", { document_type: "utility_bill" }));
      toast.show("Document uploaded", "success");
      next();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveVehicle() {
    if (!make.trim() || !plate.trim()) {
      toast.show("Enter at least vehicle make and plate number", "warning");
      return;
    }
    setLoading(true);
    try {
      await RiderApi.updateProfile({
        rider_type: "rider",
        vehicle_type: vehicleType,
        vehicle_make: make.trim(),
        vehicle_model: model.trim(),
        plate_number: plate.trim(),
      });
      toast.show("Vehicle details saved", "success");
      next();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not save", "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveEmergency() {
    if (!ecName.trim() || !ecPhone.trim()) {
      toast.show("Enter emergency contact name and phone", "warning");
      return;
    }
    setLoading(true);
    try {
      await RiderApi.emergencyContact({
        full_name: ecName.trim(),
        relationship: ecRel.trim() || "Contact",
        phone_number: ecPhone.trim(),
      });
      toast.show("Emergency contact saved", "success");
      next();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not save", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitAll() {
    setLoading(true);
    try {
      await RiderApi.submitOnboarding();
      toast.show("Application submitted for review!", "success");
      router.replace("/onboarding/pending");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Submission failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function pick(setter: (i: PickedImage | null) => void, camera: boolean) {
    const img = await pickImage(camera);
    if (img) setter(img);
    else if (Platform.OS !== "web") toast.show("Permission needed or cancelled", "warning");
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Sticky header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity testID="onboarding-back" onPress={step === 0 ? () => signOut() : back} style={styles.iconBtn}>
            <Ionicons name={step === 0 ? "log-out-outline" : "arrow-back"} size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rider Verification</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.stepLabel}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 0 && (
            <View style={styles.stepBox}>
              <StepHead icon="finger-print" title="National ID (NIN)" desc="We verify your NIN with the national database. Riders are not geofenced." />
              <Field testID="nin-input" label="NIN (11 digits)" value={nin} onChangeText={setNin} keyboardType="number-pad" maxLength={11} placeholder="12345678901" />
              <Pressable testID="nin-consent" onPress={() => setConsent((c) => !c)} style={styles.consentRow}>
                <View style={[styles.checkbox, consent && styles.checkboxOn]}>
                  {consent && <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />}
                </View>
                <Text style={styles.consentText}>
                  I consent to FoodNova verifying my NIN for identity and background checks.
                </Text>
              </Pressable>
              <Button testID="verify-nin-button" label={ninVerified ? "Verified ✓  Continue" : "Verify NIN"} onPress={ninVerified ? next : verifyNin} loading={loading} />
            </View>
          )}

          {step === 1 && (
            <View style={styles.stepBox}>
              <StepHead icon="happy-outline" title="Selfie verification" desc="Take a clear selfie in good lighting to match your ID." />
              <UploadZone image={selfie} label="Add selfie" onPick={() => pick(setSelfie, true)} testID="selfie-upload" round />
              <Button testID="selfie-submit" label="Upload & continue" onPress={uploadSelfie} loading={loading} />
              <SkipButton onSkip={next} />
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepBox}>
              <StepHead icon="document-text-outline" title="Proof of address" desc="Upload a recent utility bill (electricity, water, etc.)." />
              <UploadZone image={doc} label="Add utility bill" onPick={() => pick(setDoc, false)} testID="doc-upload" />
              <Button testID="doc-submit" label="Upload & continue" onPress={uploadDoc} loading={loading} />
              <SkipButton onSkip={next} />
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepBox}>
              <StepHead icon="bicycle-outline" title="Vehicle details" desc="Tell us what you'll be riding for deliveries." />
              <Text style={styles.label}>Vehicle type</Text>
              <View style={styles.chipRow}>
                {["motorcycle", "bicycle", "car", "van"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    testID={`vehicle-${t}`}
                    onPress={() => setVehicleType(t)}
                    style={[styles.chip, vehicleType === t && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, vehicleType === t && styles.chipTextOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Field testID="vehicle-make" label="Make" value={make} onChangeText={setMake} placeholder="e.g. Bajaj" />
              <Field testID="vehicle-model" label="Model (optional)" value={model} onChangeText={setModel} placeholder="e.g. Boxer" />
              <Field testID="vehicle-plate" label="Plate number" value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholder="ABC-123-XY" />
              <Button testID="vehicle-submit" label="Save & continue" onPress={saveVehicle} loading={loading} />
            </View>
          )}

          {step === 4 && (
            <View style={styles.stepBox}>
              <StepHead icon="call-outline" title="Emergency contact" desc="Someone we can reach in case of emergency." />
              <Field testID="ec-name" label="Full name" value={ecName} onChangeText={setEcName} placeholder="Contact name" />
              <Field testID="ec-rel" label="Relationship" value={ecRel} onChangeText={setEcRel} placeholder="e.g. Sibling" />
              <Field testID="ec-phone" label="Phone number" value={ecPhone} onChangeText={setEcPhone} keyboardType="phone-pad" placeholder="080..." />
              <Button testID="ec-submit" label="Save & continue" onPress={saveEmergency} loading={loading} />
            </View>
          )}

          {step === 5 && (
            <View style={styles.stepBox}>
              <StepHead icon="checkmark-done-circle-outline" title="Review & submit" desc="Confirm your details and submit for admin approval." />
              <ReviewRow label="Name" value={rider?.full_name || rider?.name || "--"} />
              <ReviewRow label="NIN verified" value={ninVerified ? "Yes" : "Pending"} />
              <ReviewRow label="Selfie" value={selfie ? "Added" : "Not added"} />
              <ReviewRow label="Utility bill" value={doc ? "Added" : "Not added"} />
              <ReviewRow label="Vehicle" value={`${vehicleType}${make ? ` · ${make}` : ""}`} />
              <ReviewRow label="Plate" value={plate || "--"} />
              <ReviewRow label="Emergency" value={ecName || "--"} />
              <Button testID="onboarding-submit" label="Submit application" onPress={submitAll} loading={loading} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function StepHead({ icon, title, desc }: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }) {
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={26} color={colors.brandPrimary} />
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepDesc}>{desc}</Text>
    </View>
  );
}

function UploadZone({
  image,
  label,
  onPick,
  testID,
  round,
}: {
  image: PickedImage | null;
  label: string;
  onPick: () => void;
  testID: string;
  round?: boolean;
}) {
  return (
    <TouchableOpacity testID={testID} onPress={onPick} activeOpacity={0.8} style={[styles.upload, round && styles.uploadRound]}>
      {image ? (
        <Image source={{ uri: image.uri }} style={[styles.uploadImg, round && { borderRadius: 999 }]} contentFit="cover" />
      ) : (
        <>
          <Ionicons name="cloud-upload-outline" size={30} color={colors.muted} />
          <Text style={styles.uploadLabel}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <TouchableOpacity testID="skip-step" onPress={onSkip} style={{ alignSelf: "center", padding: spacing.sm }}>
      <Text style={styles.skip}>Skip for now</Text>
    </TouchableOpacity>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: spacing.sm },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.display, fontSize: type.lg, fontWeight: "700", color: colors.onSurface },
  progressTrack: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.brandPrimary, borderRadius: radius.pill },
  stepLabel: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, fontWeight: "600" },
  body: { padding: spacing.lg, paddingBottom: spacing["3xl"] },
  stepBox: { gap: spacing.lg },
  stepIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface },
  stepDesc: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, lineHeight: 20 },
  label: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurfaceTertiary },
  consentRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  checkbox: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  consentText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.onSurfaceTertiary, lineHeight: 20 },
  upload: { height: 180, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary },
  uploadRound: { alignSelf: "center", width: 180 },
  uploadImg: { width: "100%", height: "100%", borderRadius: radius.lg },
  uploadLabel: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.muted },
  skip: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.onSurfaceTertiary, textTransform: "capitalize" },
  chipTextOn: { color: colors.onSurfaceInverse },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: spacing.md },
  reviewLabel: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  reviewValue: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.onSurface, flexShrink: 1, textAlign: "right" },
});
