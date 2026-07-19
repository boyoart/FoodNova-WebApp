import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { AuthApi, RiderApi } from "@/src/api/endpoints";
import { ApiError, loadToken, setToken } from "@/src/api/client";
import { clearOnboardingDraft } from "@/src/lib/onboarding";
import { startupLog, withTimeout } from "@/src/lib/startup";

type Rider = Record<string, any> | null;

type AuthState = {
  booting: boolean;
  authed: boolean;
  rider: Rider;
  // verification / approval state derived from backend
  approvalStatus: string | null;
  onboardingProgress: Record<string, any>;
  verificationStatus: Record<string, any>;
  bootError: string | null;
  refreshRider: () => Promise<Rider>;
  refreshOnboarding: () => Promise<{ progress: Record<string, any>; verification: Record<string, any> }>;
  signInWithToken: (token: string) => Promise<Rider>;
  signOut: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  resetSession: () => Promise<void>;
  setRider: (r: Rider) => void;
};

const AuthContext = createContext<AuthState>({} as AuthState);

function deriveApproval(r: Rider): string | null {
  if (!r) return null;
  const w = (r.worker || r.rider || r.profile || {}) as Record<string, any>;
  return (
    r.approval_status ||
    r.kyc_status ||
    r.verification_status ||
    r.status ||
    w.approval_status ||
    w.kyc_status ||
    w.status ||
    null
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [rider, setRiderState] = useState<Rider>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [onboardingProgress, setOnboardingProgress] = useState<Record<string, any>>({});
  const [verificationStatus, setVerificationStatus] = useState<Record<string, any>>({});
  const [bootError, setBootError] = useState<string | null>(null);

  const setRider = useCallback((r: Rider) => {
    setRiderState(r);
    setApprovalStatus(deriveApproval(r));
  }, []);

  const refreshOnboarding = useCallback(async () => {
    const [progressResult, verificationResult] = await Promise.allSettled([
      RiderApi.onboardingProgress(),
      RiderApi.verificationStatus(),
    ]);
    const progress = progressResult.status === "fulfilled" ? progressResult.value || {} : {};
    const verification = verificationResult.status === "fulfilled" ? verificationResult.value || {} : {};
    setOnboardingProgress(progress);
    setVerificationStatus(verification);
    return { progress, verification };
  }, []);

  const refreshRider = useCallback(async (): Promise<Rider> => {
    try {
      const [data, onboarding] = await Promise.all([RiderApi.me(), refreshOnboarding()]);
      // /delivery/me returns useful fields at the TOP level (approval_status,
      // full_name, phone_number) plus a nested `worker` with detail. Merge so
      // top-level wins but worker detail (email, vehicle, nin) is preserved.
      const r = data
        ? ({ ...(data.worker || data.rider || {}), ...data, _onboarding: onboarding } as Rider)
        : null;
      setRider(r);
      setAuthed(true);
      setBootError(null);
      return r;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await setToken(null);
        setAuthed(false);
        setRider(null);
        setBootError(null);
        startupLog("session_rejected", { reason: "unauthorized" });
      } else {
        setBootError("FoodNova could not reach the rider service.");
        startupLog("profile_restore_failed", {
          reason: error instanceof ApiError && error.status === 0 ? "network" : "service_error",
        });
      }
      return null;
    }
  }, [refreshOnboarding, setRider]);

  const signInWithToken = useCallback(
    async (token: string) => {
      await withTimeout(setToken(token), 3_000, "FN-STARTUP-STORAGE-WRITE");
      setAuthed(true);
      return refreshRider();
    },
    [refreshRider]
  );

  const signOut = useCallback(async () => {
    try {
      await AuthApi.logout();
    } finally {
      await withTimeout(setToken(null), 3_000, "FN-STARTUP-STORAGE-LOGOUT").catch(() => undefined);
      setAuthed(false);
      setRiderState(null);
      setApprovalStatus(null);
      setOnboardingProgress({});
      setVerificationStatus({});
      setBootError(null);
      await withTimeout(clearOnboardingDraft(), 3_000, "FN-STARTUP-DRAFT-CLEAR").catch(() => undefined);
    }
  }, []);

  const resetSession = useCallback(async () => {
    await withTimeout(setToken(null), 3_000, "FN-STARTUP-STORAGE-RESET").catch(() => undefined);
    await withTimeout(clearOnboardingDraft(), 3_000, "FN-STARTUP-DRAFT-RESET").catch(() => undefined);
    setAuthed(false);
    setRider(null);
    setOnboardingProgress({});
    setVerificationStatus({});
    setBootError(null);
    startupLog("session_reset");
  }, [setRider]);

  const retryBootstrap = useCallback(async () => {
    setBooting(true);
    setBootError(null);
    startupLog("restore_started");
    try {
      const token = await withTimeout(loadToken(), 3_000, "FN-STARTUP-STORAGE-READ");
      if (!token) {
        setAuthed(false);
        setRider(null);
        startupLog("terminal_route_ready", { route: "login" });
        return;
      }
      setAuthed(true);
      const restored = await refreshRider();
      if (restored) startupLog("session_restored", { status: deriveApproval(restored) || "incomplete" });
    } catch (error) {
      setBootError("FoodNova could not restore the local session.");
      startupLog("restore_failed", { code: String(error).includes("FN-") ? String(error) : "FN-STARTUP-RESTORE" });
    } finally {
      setBooting(false);
      startupLog("restore_finished");
    }
  }, [refreshRider, setRider]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (active) await retryBootstrap();
      } catch {
        // retryBootstrap always settles state; this guard protects unmount races.
      }
    })();
    return () => {
      active = false;
    };
  }, [retryBootstrap]);

  return (
    <AuthContext.Provider
      value={{
        booting,
        authed,
        rider,
        approvalStatus,
        onboardingProgress,
        verificationStatus,
        bootError,
        refreshRider,
        refreshOnboarding,
        signInWithToken,
        signOut,
        retryBootstrap,
        resetSession,
        setRider,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
