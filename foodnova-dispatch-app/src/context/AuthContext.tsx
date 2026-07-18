import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { AuthApi, RiderApi } from "@/src/api/endpoints";
import { ApiError, loadToken, setToken } from "@/src/api/client";
import { clearOnboardingDraft } from "@/src/lib/onboarding";

type Rider = Record<string, any> | null;

type AuthState = {
  booting: boolean;
  authed: boolean;
  rider: Rider;
  // verification / approval state derived from backend
  approvalStatus: string | null;
  onboardingProgress: Record<string, any>;
  verificationStatus: Record<string, any>;
  refreshRider: () => Promise<Rider>;
  refreshOnboarding: () => Promise<{ progress: Record<string, any>; verification: Record<string, any> }>;
  signInWithToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
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
      return r;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await setToken(null);
        setAuthed(false);
        setRider(null);
      }
      return null;
    }
  }, [refreshOnboarding, setRider]);

  const signInWithToken = useCallback(
    async (token: string) => {
      await setToken(token);
      setAuthed(true);
      await refreshRider();
    },
    [refreshRider]
  );

  const signOut = useCallback(async () => {
    try {
      await AuthApi.logout();
    } finally {
      await setToken(null);
      setAuthed(false);
      setRiderState(null);
      setApprovalStatus(null);
      setOnboardingProgress({});
      setVerificationStatus({});
      await clearOnboardingDraft();
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await loadToken();
        if (token && active) {
          setAuthed(true);
          await refreshRider();
        }
      } catch (error) {
        console.log("DISPATCH_SESSION_RESTORE_FAILED", String(error));
        if (active) {
          setAuthed(false);
          setRider(null);
        }
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshRider, setRider]);

  return (
    <AuthContext.Provider
      value={{
        booting,
        authed,
        rider,
        approvalStatus,
        onboardingProgress,
        verificationStatus,
        refreshRider,
        refreshOnboarding,
        signInWithToken,
        signOut,
        setRider,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
