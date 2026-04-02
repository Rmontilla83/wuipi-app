"use client";

import { createContext, useContext, type ReactNode } from "react";

interface PortalContext {
  partnerId: number;
  customerName: string;
  email: string;
}

const Ctx = createContext<PortalContext | null>(null);

export function PortalProvider({
  children,
  partnerId,
  customerName,
  email,
}: PortalContext & { children: ReactNode }) {
  return (
    <Ctx.Provider value={{ partnerId, customerName, email }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePortal(): PortalContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}
