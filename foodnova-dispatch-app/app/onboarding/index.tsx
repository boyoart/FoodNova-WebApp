import { useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { RiderApi } from "@/src/api/endpoints";
import { ApiError } from "@/src/api/client";
import { Button, Field } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { PickedImage, pickImage, toFormData, validateImageUpload } from "@/src/lib/image";
import {
  ONBOARDING_STAGES,
  backendOnboardingStep,
  clearOnboardingDraft,
  loadOnboardingDraft,
  resolveOnboardingState,
  safeVerifiedIdentity,
  saveOnboardingDraft,
} from "@/src/lib/onboarding";
import { colors, fonts, radius, spacing, type } from "@/src/theme/tokens";

const PHONE_RE = /^[+\d][\d\s().-]{7,}$/;
const RELATIONSHIPS = ["parent", "spouse", "sibling", "friend", "guardian", "other"];
const DOCUMENT_TYPES = [
  { value: "drivers_license", label: "Driver's License" },
  { value: "voters_card", label: "Voter's Card" },
  { value: "international_passport", label: "International Passport" },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { remediate } = useLocalSearchParams<{ remediate?: string }>();
  const toast = useToast();
  const {
    rider,
    signOut,
    onboardingProgress,
    verificationStatus,
    refreshOnboarding,
    refreshRider,
  } = useAuth();

  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nin, setNin] = useState("");
  const [consent, setConsent] = useState(false);
  const [verifiedIdentity, setVerifiedIdentity] = useState<Record<string, string>>({});
  const [addressDoc, setAddressDoc] = useState<PickedImage | null>(null);
  const [selfie, setSelfie] = useState<PickedImage | null>(null);
  const [governmentId, setGovernmentId] = useState<PickedImage | null>(null);
  const [governmentIdType, setGovernmentIdType] = useState("drivers_license");
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [ecName, setEcName] = useState("");
  const [ecRelationship, setEcRelationship] = useState("parent");
  const [ecPhone, setEcPhone] = useState("");
  const accountId = String(onboardingProgress?.data?.rider_id || onboardingProgress?.rider_id || rider?.worker_id || rider?.id || rider?.email || "");

  useEffect(() => {
    let active = true;
    (async () => {
      const draft = await loadOnboardingDraft(accountId);
      const serverStep = backendOnboardingStep(
        onboardingProgress?.data,
        onboardingProgress,
        verificationStatus?.data,
        verificationStatus,
        rider
      );
      if (!active) return;
      setStep(serverStep);
      setVerifiedIdentity({ ...safeVerifiedIdentity(verificationStatus), ...(draft.verifiedIdentity || {}) });
      setVehicleType(draft.vehicleType || "motorcycle");
      setMake(draft.vehicleMake || "");
      setModel(draft.vehicleModel || "");
      setPlate(draft.vehiclePlate || "");
      setEcName(draft.emergencyName || "");
      setEcRelationship(draft.emergencyRelationship || "parent");
      setEcPhone(draft.emergencyPhone || "");
      setGovernmentIdType(draft.governmentIdType || "drivers_license");
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, [accountId, onboardingProgress, rider, verificationStatus]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      saveOnboardingDraft(accountId, {
        step,
        verifiedIdentity,
        vehicleType,
        vehicleMake: make,
        vehicleModel: model,
        vehiclePlate: plate,
        emergencyName: ecName,
        emergencyRelationship: ecRelationship,
        emergencyPhone: ecPhone,
        governmentIdType,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [accountId, ecName, ecPhone, ecRelationship, governmentIdType, hydrated, make, model, plate, step, vehicleType, verifiedIdentity]);

  useEffect(() => {
    const state = resolveOnboardingState(onboardingProgress, verificationStatus, rider);
    if (state.destination === "dashboard") router.replace("/(tabs)");
    else if (state.destination === "pending_review" || (state.destination === "rejected" && remediate !== "1")) router.replace("/onboarding/pending");
  }, [onboardingProgress, remediate, rider, router, verificationStatus]);

  const progress = useMemo(() => ((step + 1) / ONBOARDING_STAGES.length) * 100, [step]);
  const resolution = useMemo(() => resolveOnboardingState(onboardingProgress, verificationStatus, rider), [onboardingProgress, rider, verificationStatus]);

  async function advance(nextStep = step + 1) {
    const next = Math.min(nextStep, ONBOARDING_STAGES.length - 1);
    setStep(next);
    await saveOnboardingDraft(accountId, { step: next, verifiedIdentity, vehicleType, vehicleMake: make, vehicleModel: model, vehiclePlate: plate, emergencyName: ecName, emergencyRelationship: ecRelationship, emergencyPhone: ecPhone, governmentIdType });
  }

  async function verifyNin() {
    if (!/^\d{11}$/.test(nin.trim())) return toast.show("NIN must be exactly 11 digits", "warning");
    if (!consent) return toast.show("Accept the NIN verification consent to continue", "warning");
    setLoading(true);
    try {
      const response = await RiderApi.verifyNin(nin.trim());
      const identity = safeVerifiedIdentity(response);
      setVerifiedIdentity(identity);
      toast.show("Identity verified", "success");
      await refreshOnboarding();
      await advance(1);
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : "NIN verification failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function upload(image: PickedImage | null, label: string, action: (form: FormData) => Promise<any>, documentType?: string) {
    const error = validateImageUpload(image, label);
    if (error) return toast.show(error, "warning");
    setLoading(true);
    try {
      await action(toFormData(image!, "document", documentType ? { document_type: documentType } : undefined));
      toast.show(`${label} uploaded`, "success");
      await refreshOnboarding();
      await advance();
    } catch (uploadError) {
      toast.show(uploadError instanceof ApiError ? uploadError.message : `${label} upload failed`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveEmergency() {
    if (ecName.trim().length < 2) return toast.show("Enter the emergency contact's full name", "warning");
    if (!PHONE_RE.test(ecPhone.trim())) return toast.show("Enter a valid emergency contact phone number", "warning");
    setLoading(true);
    try {
      await RiderApi.emergencyContact({ full_name: ecName.trim(), relationship: ecRelationship, phone_number: ecPhone.trim() });
      toast.show("Emergency contact saved", "success");
      await advance();
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : "Could not save emergency contact", "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveVehicle() {
    if (!make.trim() || !plate.trim()) return toast.show("Vehicle make and plate number are required", "warning");
    setLoading(true);
    try {
      await RiderApi.updateProfile({ worker_type: "RIDER", rider_type: "rider", vehicle_type: vehicleType, vehicle_make: make.trim(), vehicle_model: model.trim(), plate_number: plate.trim() });
      toast.show("Vehicle information saved", "success");
      await advance();
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : "Could not save vehicle information", "error");
    } finally {
      setLoading(false);
    }
  }

  async function completeTraining() {
    setLoading(true);
    try {
      await RiderApi.completeTraining();
      toast.show("Training completed", "success");
      await advance();
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : "Could not record training completion", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    setLoading(true);
    try {
      await RiderApi.submitOnboarding();
      await clearOnboardingDraft(accountId);
      await refreshRider();
      toast.show("Application submitted for review", "success");
      router.replace("/onboarding/pending");
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : "Submission failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function selectImage(setter: (image: PickedImage | null) => void, camera: boolean) {
    const image = await pickImage(camera);
    if (image) setter(image);
    else if (Platform.OS !== "web") toast.show("Image selection was cancelled or permission was denied", "warning");
  }

  async function exit() {
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={step === 0 ? exit : () => setStep((value) => Math.max(0, value - 1))} style={styles.iconButton}>
            <Ionicons name={step === 0 ? "log-out-outline" : "arrow-back"} size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rider onboarding</Text>
          <Text style={styles.percent}>{Math.round(progress)}%</Text>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        <Text style={styles.stepLabel}>Step {step + 1} of {ONBOARDING_STAGES.length} · {ONBOARDING_STAGES[step].title}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {resolution.forceReonboarding && <View style={styles.notice}><Ionicons name="information-circle" size={22} color={colors.brandPrimary} /><Text style={styles.noticeText}>FoodNova requested onboarding verification again.{resolution.reason ? ` ${resolution.reason}` : ""}</Text></View>}
          {step === 0 && <Stage icon="finger-print" title="Verify your identity" description="Enter your NIN and consent to secure identity verification.">
            <Field label="NIN" value={nin} onChangeText={setNin} keyboardType="number-pad" maxLength={11} placeholder="11-digit NIN" />
            <Pressable onPress={() => setConsent((value) => !value)} style={styles.consentRow}>
              <View style={[styles.checkbox, consent && styles.checkboxSelected]}>{consent && <Ionicons name="checkmark" size={16} color="#fff" />}</View>
              <Text style={styles.consentText}>I consent to FoodNova verifying my NIN for rider onboarding.</Text>
            </Pressable>
            <Button label="Verify NIN" onPress={verifyNin} loading={loading} />
          </Stage>}

          {step === 1 && <Stage icon="shield-checkmark" title="Verified information" description="These details came from the identity verification response and cannot be edited here.">
            {Object.keys(verifiedIdentity).length ? Object.entries(verifiedIdentity).map(([label, value]) => <ReviewRow key={label} label={label} value={value} />) : <Text style={styles.help}>Identity verification is recorded. No additional identity fields were returned.</Text>}
            <Button label="Continue" onPress={() => advance()} />
          </Stage>}

          {step === 2 && <Stage icon="home" title="Verify your address" description="Upload a recent utility bill. This is separate from your government ID.">
            <UploadZone image={addressDoc} label="Choose utility bill" onPress={() => selectImage(setAddressDoc, false)} />
            <Button label="Upload proof of address" onPress={() => upload(addressDoc, "Proof of address", RiderApi.verifyAddress, "utility_bill")} loading={loading} />
          </Stage>}

          {step === 3 && <Stage icon="call" title="Emergency contact" description="Choose the relationship and provide a reliable contact.">
            <Field label="Full name" value={ecName} onChangeText={setEcName} placeholder="Contact name" />
            <Text style={styles.fieldLabel}>Relationship</Text>
            <ChoiceRow values={RELATIONSHIPS} selected={ecRelationship} onSelect={setEcRelationship} />
            <Field label="Phone number" value={ecPhone} onChangeText={setEcPhone} keyboardType="phone-pad" placeholder="Phone number" />
            <Button label="Save emergency contact" onPress={saveEmergency} loading={loading} />
          </Stage>}

          {step === 4 && <Stage icon="camera" title="Selfie verification" description="Take a clear, current selfie in good lighting.">
            <UploadZone image={selfie} label="Take selfie" onPress={() => selectImage(setSelfie, true)} round />
            <Button label="Upload selfie" onPress={() => upload(selfie, "Selfie", RiderApi.uploadSelfie)} loading={loading} />
          </Stage>}

          {step === 5 && <Stage icon="document-text" title="Government ID" description="Upload one supported government-issued identification document.">
            <Text style={styles.fieldLabel}>Document type</Text>
            {DOCUMENT_TYPES.map((item) => <TouchableOpacity key={item.value} onPress={() => setGovernmentIdType(item.value)} style={[styles.option, governmentIdType === item.value && styles.optionSelected]}><Ionicons name={governmentIdType === item.value ? "radio-button-on" : "radio-button-off"} size={20} color={colors.brandPrimary} /><Text style={styles.optionText}>{item.label}</Text></TouchableOpacity>)}
            <UploadZone image={governmentId} label="Choose government ID" onPress={() => selectImage(setGovernmentId, false)} />
            <Button label="Upload government ID" onPress={() => upload(governmentId, "Government ID", RiderApi.uploadDocument, governmentIdType)} loading={loading} />
          </Stage>}

          {step === 6 && <Stage icon="bicycle" title="Vehicle information" description="Provide the vehicle used for FoodNova deliveries.">
            <Text style={styles.fieldLabel}>Vehicle type</Text>
            <ChoiceRow values={["motorcycle", "bicycle", "car", "van"]} selected={vehicleType} onSelect={setVehicleType} />
            <Field label="Make" value={make} onChangeText={setMake} placeholder="e.g. Bajaj" />
            <Field label="Model (optional)" value={model} onChangeText={setModel} placeholder="e.g. Boxer" />
            <Field label="Plate number" value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholder="ABC-123-XY" />
            <Button label="Save vehicle information" onPress={saveVehicle} loading={loading} />
          </Stage>}

          {step === 7 && <Stage icon="school" title="Rider training" description="Confirm the core FoodNova delivery standards before submitting your application.">
            {["Protect customer orders and personal information", "Confirm pickup contents before leaving", "Never request the customer's PIN before arrival", "Use safe routes and follow local traffic laws"].map((item) => <View key={item} style={styles.trainingRow}><Ionicons name="checkmark-circle" size={20} color={colors.success} /><Text style={styles.trainingText}>{item}</Text></View>)}
            <Button label="I have completed the training" onPress={completeTraining} loading={loading} />
          </Stage>}

          {step === 8 && <Stage icon="clipboard" title="Review your application" description="Review the information below before final submission.">
            <ReviewRow label="Name" value={String(rider?.full_name || rider?.name || "On file")} />
            <ReviewRow label="Identity" value="Verified" />
            <ReviewRow label="Address" value="Uploaded" />
            <ReviewRow label="Government ID" value={DOCUMENT_TYPES.find((item) => item.value === governmentIdType)?.label || "Uploaded"} />
            <ReviewRow label="Vehicle" value={`${vehicleType} · ${make || "On file"}`} />
            <ReviewRow label="Emergency contact" value={ecName || "On file"} />
            <Button label="Continue to submission" onPress={() => advance()} />
          </Stage>}

          {step === 9 && <Stage icon="send" title="Submit application" description="Your dashboard will open in limited mode while FoodNova reviews your application.">
            <View style={styles.notice}><Ionicons name="information-circle" size={22} color={colors.brandPrimary} /><Text style={styles.noticeText}>Deliveries remain disabled until an administrator approves your application.</Text></View>
            <Button label="Submit for review" onPress={submit} loading={loading} />
          </Stage>}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Stage({ icon, title, description, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; children: React.ReactNode }) {
  return <View style={styles.stage}><View style={styles.stageIcon}><Ionicons name={icon} size={26} color={colors.brandPrimary} /></View><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text>{children}</View>;
}

function ChoiceRow({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) {
  return <View style={styles.choiceRow}>{values.map((value) => <TouchableOpacity key={value} onPress={() => onSelect(value)} style={[styles.chip, selected === value && styles.chipSelected]}><Text style={[styles.chipText, selected === value && styles.chipTextSelected]}>{value}</Text></TouchableOpacity>)}</View>;
}

function UploadZone({ image, label, onPress, round }: { image: PickedImage | null; label: string; onPress: () => void; round?: boolean }) {
  return <TouchableOpacity onPress={onPress} style={[styles.upload, round && styles.uploadRound]}>{image ? <Image source={{ uri: image.uri }} style={[styles.uploadImage, round && { borderRadius: 999 }]} contentFit="cover" /> : <><Ionicons name="cloud-upload-outline" size={32} color={colors.muted} /><Text style={styles.uploadText}>{label}</Text></>}</TouchableOpacity>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.reviewRow}><Text style={styles.reviewLabel}>{label}</Text><Text style={styles.reviewValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: spacing.sm },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.display, fontSize: type.lg, fontWeight: "700", color: colors.onSurface },
  percent: { width: 44, textAlign: "right", fontFamily: fonts.text, fontSize: type.sm, fontWeight: "700", color: colors.brandPrimary },
  progressTrack: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.brandPrimary },
  stepLabel: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  body: { padding: spacing.lg, paddingBottom: spacing["3xl"] },
  stage: { gap: spacing.lg },
  stageIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: type["2xl"], fontWeight: "700", color: colors.onSurface },
  description: { fontFamily: fonts.text, fontSize: type.base, lineHeight: 21, color: colors.muted },
  consentRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  checkbox: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  consentText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, lineHeight: 20, color: colors.onSurfaceTertiary },
  fieldLabel: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.onSurface },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  chipSelected: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: fonts.text, textTransform: "capitalize", color: colors.onSurfaceTertiary },
  chipTextSelected: { color: colors.onSurfaceInverse, fontWeight: "700" },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  optionSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  optionText: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface },
  upload: { height: 180, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: spacing.sm, overflow: "hidden" },
  uploadRound: { width: 180, alignSelf: "center", borderRadius: 90 },
  uploadImage: { width: "100%", height: "100%" },
  uploadText: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "600", color: colors.muted },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  reviewLabel: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  reviewValue: { flex: 1, textAlign: "right", fontFamily: fonts.text, fontSize: type.base, fontWeight: "700", color: colors.onSurface },
  help: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  trainingRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  trainingText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, lineHeight: 21, color: colors.onSurfaceTertiary },
  notice: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  noticeText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, lineHeight: 20, color: colors.onBrandTertiary },
});
