import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Haptics from "expo-haptics";

import { RiderApi } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { Offer, offerId } from "@/src/components/OfferModal";
import { asList } from "@/src/lib/normalize";
import { addForegroundNotificationListener, showLocalOfferNotification } from "@/src/lib/push";
import { notificationOfferId, resolveNotificationDestination } from "@/src/lib/notification-routing";
import { isApprovedRider } from "@/src/lib/rider-state";

const OFFER_POLL_MS = 15000;

type OfferState = {
  offers: Offer[];
  currentOffer: Offer | null;
  busy: boolean;
  refreshOffers: (preferredOfferId?: string) => Promise<Offer[]>;
  presentOffer: (offer: Offer | null) => void;
  acceptCurrentOffer: () => Promise<Offer | null>;
  declineCurrentOffer: (reason?: string) => Promise<void>;
};

const OfferContext = createContext<OfferState>({} as OfferState);

export function OfferProvider({ children }: { children: React.ReactNode }) {
  const { authed, rider } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [currentOffer, setCurrentOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const requestActive = useRef(false);
  const offersRef = useRef<Offer[]>([]);
  const seen = useRef(new Set<string>());
  const remoteOfferAt = useRef(0);
  const currentRef = useRef<Offer | null>(null);

  useEffect(() => {
    currentRef.current = currentOffer;
  }, [currentOffer]);

  useEffect(() => {
    offersRef.current = offers;
  }, [offers]);

  const refreshOffers = useCallback(async (preferredOfferId?: string) => {
    if (requestActive.current) return offersRef.current;
    requestActive.current = true;
    try {
      const data = await RiderApi.offers();
      const list = asList(data) as Offer[];
      setOffers(list);
      const preferred = preferredOfferId ? list.find((item) => offerId(item) === preferredOfferId) : null;
      const fresh = preferred || list.find((item) => !seen.current.has(offerId(item)));
      if (fresh && !currentRef.current) {
        seen.current.add(offerId(fresh));
        setCurrentOffer(fresh);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (Date.now() - remoteOfferAt.current > 5000) {
          showLocalOfferNotification().catch(() => {});
        }
      }
      return list;
    } catch (error: any) {
      console.log("OFFER_FEED_FAILED", { error: String(error?.message || error) });
      return offersRef.current;
    } finally {
      requestActive.current = false;
    }
  }, []);

  // The backend is authoritative for offer eligibility. Do not suppress the
  // persisted offer inbox because a locally cached heartbeat is stale.
  const eligible = authed && isApprovedRider(rider);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!eligible || appState !== "active") return;
    refreshOffers();
    const timer = setInterval(() => refreshOffers(), OFFER_POLL_MS);
    return () => clearInterval(timer);
  }, [appState, eligible, refreshOffers]);

  useEffect(() => {
    if (!authed) {
      setOffers([]);
      setCurrentOffer(null);
      seen.current.clear();
      return;
    }
    return addForegroundNotificationListener((data) => {
      const target = resolveNotificationDestination(data);
      if (target.offerId || String(data?.type || data?.notification_type || "").toLowerCase().includes("offer")) {
        remoteOfferAt.current = Date.now();
        refreshOffers(notificationOfferId(data) || undefined);
      }
    });
  }, [authed, refreshOffers]);

  const acceptCurrentOffer = useCallback(async () => {
    const selected = currentRef.current;
    if (!selected) return null;
    setBusy(true);
    try {
      await RiderApi.acceptOffer(offerId(selected));
      setOffers((items) => items.filter((item) => offerId(item) !== offerId(selected)));
      setCurrentOffer(null);
      return selected;
    } finally {
      setBusy(false);
    }
  }, []);

  const declineCurrentOffer = useCallback(async (reason = "Rider declined") => {
    const selected = currentRef.current;
    if (!selected) return;
    setBusy(true);
    try {
      await RiderApi.declineOffer(offerId(selected), reason);
      setOffers((items) => items.filter((item) => offerId(item) !== offerId(selected)));
      setCurrentOffer(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <OfferContext.Provider
      value={{ offers, currentOffer, busy, refreshOffers, presentOffer: setCurrentOffer, acceptCurrentOffer, declineCurrentOffer }}
    >
      {children}
    </OfferContext.Provider>
  );
}

export const useOffers = () => useContext(OfferContext);
