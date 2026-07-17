import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { NotifApi } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { addForegroundNotificationListener } from "@/src/lib/push";
import { pick } from "@/src/lib/normalize";

type NotificationState = {
  unread: number;
  refreshUnread: () => Promise<number>;
};

const NotificationContext = createContext<NotificationState>({ unread: 0, refreshUnread: async () => 0 });

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { authed } = useAuth();
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!authed) {
      setUnread(0);
      return 0;
    }
    try {
      const data = await NotifApi.unreadCount();
      const value = Number(pick(data, ["count", "unread", "unread_count"], 0)) || 0;
      setUnread(value);
      return value;
    } catch {
      return 0;
    }
  }, [authed]);

  useEffect(() => {
    if (!authed) {
      setUnread(0);
      return;
    }
    refreshUnread();
    return addForegroundNotificationListener(() => {
      refreshUnread();
    });
  }, [authed, refreshUnread]);

  return <NotificationContext.Provider value={{ unread, refreshUnread }}>{children}</NotificationContext.Provider>;
}

export const useNotificationsState = () => useContext(NotificationContext);
