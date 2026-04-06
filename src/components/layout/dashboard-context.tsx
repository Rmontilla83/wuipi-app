"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface ServiceStats {
  total: number;
  active: number;
  paused: number;
}

interface AiStatus {
  ai: boolean;
  gemini: boolean;
  claude: boolean;
}

interface DashboardContextValue {
  services: ServiceStats | null;
  aiStatus: AiStatus | null;
  refresh: () => void;
}

const DashboardContext = createContext<DashboardContextValue>({
  services: null,
  aiStatus: null,
  refresh: () => {},
});

export function useDashboardContext() {
  return useContext(DashboardContext);
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<ServiceStats | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/odoo/financial-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.active_services !== undefined) {
          setServices({
            total: (d.active_services || 0) + (d.paused_services || 0),
            active: d.active_services || 0,
            paused: d.paused_services || 0,
          });
        }
      })
      .catch(() => {});

    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.services) setAiStatus(d.services);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // Refresh every 5 minutes (data changes slowly)
    const interval = setInterval(refresh, 300000);

    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return (
    <DashboardContext.Provider value={{ services, aiStatus, refresh }}>
      {children}
    </DashboardContext.Provider>
  );
}
