import { createContext, useContext } from "react";
import type { useAppController } from "../app/useAppController";

export type AppControllerValue = ReturnType<typeof useAppController>;

export const AppControllerContext = createContext<AppControllerValue | null>(null);

export function useAppControllerContext(): AppControllerValue {
  const ctx = useContext(AppControllerContext);
  if (!ctx) {
    throw new Error("useAppControllerContext must be used within AppControllerContext.Provider");
  }
  return ctx;
}
