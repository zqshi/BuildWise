import { createContext, useContext, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import type { StatusPayload } from "../domain/workspace/types";

function readStorageString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStorageRole(key: string): "owner" | "pm" | "developer" | "qa" | "viewer" {
  const raw = readStorageString(key);
  if (raw === "owner" || raw === "pm" || raw === "developer" || raw === "qa" || raw === "viewer") {
    return raw;
  }
  return "viewer";
}

type NavigationContextValue = {
  activeView: "dashboard" | "projects" | "permissions";
  setActiveView: React.Dispatch<React.SetStateAction<"dashboard" | "projects" | "permissions">>;
  projectPanelMode: "project" | "iteration";
  setProjectPanelMode: React.Dispatch<React.SetStateAction<"project" | "iteration">>;
  showUserMenu: boolean;
  setShowUserMenu: React.Dispatch<React.SetStateAction<boolean>>;
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  setCurrentRole: React.Dispatch<React.SetStateAction<"owner" | "pm" | "developer" | "qa" | "viewer">>;
  busy: boolean;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  status: StatusPayload | null;
  setStatus: React.Dispatch<React.SetStateAction<StatusPayload | null>>;
  userMenuRef: React.MutableRefObject<HTMLDivElement | null>;
};

type ViewType = "dashboard" | "projects" | "permissions";

function viewFromHash(): ViewType | null {
  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (hash === "dashboard") return "dashboard";
  if (hash === "projects") return "projects";
  if (hash === "permissions") return "permissions";
  return null;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ViewType>(() => {
    const fromHash = viewFromHash();
    if (fromHash) return fromHash;
    const cached = readStorageString("buildwise:active-view");
    if (cached === "projects" || cached === "permissions") return cached;
    return "dashboard";
  });
  const [projectPanelMode, setProjectPanelMode] = useState<"project" | "iteration">(() => {
    const cached = readStorageString("buildwise:project-panel-mode");
    return cached === "iteration" ? "iteration" : "project";
  });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentRole, setCurrentRole] = useState<"owner" | "pm" | "developer" | "qa" | "viewer">(
    () => readStorageRole("buildwise:auth-role")
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("buildwise:active-view", activeView);
    } catch {
      // ignore storage failure
    }
    // 同步 hash
    const currentHash = viewFromHash();
    if (currentHash !== activeView) {
      window.location.hash = `/${activeView}`;
    }
  }, [activeView]);

  useEffect(() => {
    const onHashChange = () => {
      const view = viewFromHash();
      if (view) setActiveView(view);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("buildwise:project-panel-mode", projectPanelMode);
    } catch {
      // ignore storage failure
    }
  }, [projectPanelMode]);

  const value = useMemo(
    () => ({
      activeView,
      setActiveView,
      projectPanelMode,
      setProjectPanelMode,
      showUserMenu,
      setShowUserMenu,
      currentRole,
      setCurrentRole,
      busy,
      setBusy,
      error,
      setError,
      status,
      setStatus,
      userMenuRef,
    }),
    [activeView, projectPanelMode, showUserMenu, currentRole, busy, error, status]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigationContext() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("Missing NavigationProvider");
  return ctx;
}
