"use client";

import { createContext, useContext } from "react";

const DashboardUserContext = createContext<string | null>(null);

export const DashboardUserProvider = DashboardUserContext.Provider;

export function useDashboardUserId() {
  return useContext(DashboardUserContext);
}
