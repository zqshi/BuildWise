import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  getInteractionDrawerWidthBounds,
  getArtifactDrawerWidthBounds,
} from "./iterationWorkspacePanelUtils";

export type DrawerResizeState = {
  interactionDrawerWidth: number;
  setInteractionDrawerWidth: React.Dispatch<React.SetStateAction<number>>;
  artifactDrawerWidth: number;
  setArtifactDrawerWidth: React.Dispatch<React.SetStateAction<number>>;
  handleInteractionDrawerResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleArtifactDrawerResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function useDrawerResize(): DrawerResizeState {
  const [interactionDrawerWidth, setInteractionDrawerWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 680;
    }
    try {
      const raw = window.localStorage.getItem("buildwise:interaction-drawer-width");
      const parsed = Number(raw);
      const { min, max } = getInteractionDrawerWidthBounds(window.innerWidth);
      if (!Number.isFinite(parsed)) {
        return Math.min(680, max);
      }
      return Math.max(min, Math.min(max, parsed));
    } catch {
      return 680;
    }
  });

  const [artifactDrawerWidth, setArtifactDrawerWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 760;
    }
    try {
      const raw = window.localStorage.getItem("buildwise:artifact-drawer-width");
      const parsed = Number(raw);
      const { min, max } = getArtifactDrawerWidthBounds(window.innerWidth);
      if (!Number.isFinite(parsed)) {
        return Math.max(min, Math.min(max, Math.round(window.innerWidth * 0.42)));
      }
      return Math.max(min, Math.min(max, parsed));
    } catch {
      return 760;
    }
  });

  const interactionDrawerResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const artifactDrawerResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  /* ── interaction drawer pointer-move / pointer-up ── */
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = interactionDrawerResizeRef.current;
      if (!resizeState) {
        return;
      }
      const delta = resizeState.startX - event.clientX;
      const { min, max } = getInteractionDrawerWidthBounds(window.innerWidth);
      const next = Math.max(min, Math.min(max, resizeState.startWidth + delta));
      setInteractionDrawerWidth(next);
    };
    const onPointerUp = () => {
      interactionDrawerResizeRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  /* ── artifact drawer pointer-move / pointer-up ── */
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = artifactDrawerResizeRef.current;
      if (!resizeState) {
        return;
      }
      const delta = resizeState.startX - event.clientX;
      const { min, max } = getArtifactDrawerWidthBounds(window.innerWidth);
      const next = Math.max(min, Math.min(max, resizeState.startWidth + delta));
      setArtifactDrawerWidth(next);
    };
    const onPointerUp = () => {
      artifactDrawerResizeRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  /* ── window resize clamp ── */
  useEffect(() => {
    const onResize = () => {
      const { min, max } = getInteractionDrawerWidthBounds(window.innerWidth);
      setInteractionDrawerWidth((prev) => Math.max(min, Math.min(max, prev)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const { min, max } = getArtifactDrawerWidthBounds(window.innerWidth);
      setArtifactDrawerWidth((prev) => Math.max(min, Math.min(max, prev)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ── persist to localStorage ── */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem("buildwise:interaction-drawer-width", String(interactionDrawerWidth));
    } catch {
      // ignore storage failure
    }
  }, [interactionDrawerWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem("buildwise:artifact-drawer-width", String(artifactDrawerWidth));
    } catch {
      // ignore storage failure
    }
  }, [artifactDrawerWidth]);

  /* ── resize-start handlers ── */
  const handleInteractionDrawerResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    interactionDrawerResizeRef.current = {
      startX: event.clientX,
      startWidth: interactionDrawerWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleArtifactDrawerResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    artifactDrawerResizeRef.current = {
      startX: event.clientX,
      startWidth: artifactDrawerWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return {
    interactionDrawerWidth,
    setInteractionDrawerWidth,
    artifactDrawerWidth,
    setArtifactDrawerWidth,
    handleInteractionDrawerResizePointerDown,
    handleArtifactDrawerResizePointerDown,
  };
}
