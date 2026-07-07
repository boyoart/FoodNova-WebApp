import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { AuthApi, RiderApi } from "@/src/api/endpoints";
import { loadToken, setToken } from "@/src/api/client";

type Rider = Record<string, any> | null;

type AuthState = {
  booting: boolean;
  authed: boolean;
  rider: Rider;
  // verification / approval state derived from backend
  approvalStatus: string | null;
  refreshRider: () => Promise<Rider>;
  signInWithToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setRider: (r: Rider) => void;
};

const AuthContext = createContext<AuthState>({} as AuthState);

function deriveApproval(r: Rider): string | null {
  if (!r) return null;
  const src = r.worker || r.rider || r.profile || r;
  return (
    src.approval_status ||
    src.verification_status ||
    src.status ||
    src.kyc_status ||
    null
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [rider, setRiderState] = useState<Rider>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);

  const setRider = useCallback((r: Rider) => {
    setRiderState(r);
    setApprovalStatus(deriveApproval(r));
  }, []);

  const refreshRider = useCallback(async (): Promise<Rider> => {
    try {
      const data = await RiderApi.me();
      const r = (data && (data.worker || data.rider || data.data || data)) as Rider;
      setRider(r);
      setAuthed(true);
      return r;
    } catch {
      return null;
    }
  }, [setRider]);

  const signInWithToken = useCallback(
    async (token: string) => {
      await setToken(token);
      setAuthed(true);
      await refreshRider();
    },
    [refreshRider]
  );

  const signOut = useCallback(async () => {
    await AuthApi.logout();
    setAuthed(false);
    setRiderState(null);
    setApprovalStatus(null);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await loadToken();
      if (token) {
        setAuthed(true);
        await refreshRider();
      }
      setBooting(false);
    })();
  }, [refreshRider]);

  return (
    <AuthContext.Provider
      value={{
        booting,
        authed,
        rider,
        approvalStatus,
        refreshRider,
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
