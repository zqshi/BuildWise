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

type BoundsGetter = (viewportWidth: number) => { min: number; max: number };

function readStoredWidth(storageKey: string, defaultWidth: number, boundsGetter: BoundsGetter): number {
  if (typeof window === "undefined") return defaultWidth;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = Number(raw);
    const { min, max } = boundsGetter(window.innerWidth);
    if (!Number.isFinite(parsed)) return Math.min(defaultWidth, max);
    return Math.max(min, Math.min(max, parsed));
  } catch {
    return defaultWidth;
  }
}

function useResizeDrag(
  boundsGetter: BoundsGetter,
  setWidth: React.Dispatch<React.SetStateAction<number>>
): [React.RefObject<{ startX: number; startWidth: number } | null>, (event: ReactPointerEvent<HTMLButtonElement>, currentWidth: number) => void] {
  const ref = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const rs = ref.current;
      if (!rs) return;
      const delta = rs.startX - event.clientX;
      const { min, max } = boundsGetter(window.innerWidth);
      setWidth(Math.max(min, Math.min(max, rs.startWidth + delta)));
    };
    const onPointerUp = () => { ref.current = null; };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); };
  }, []);

  useEffect(() => {
    const onResize = () => {
      const { min, max } = boundsGetter(window.innerWidth);
      setWidth((prev) => Math.max(min, Math.min(max, prev)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, currentWidth: number) => {
    ref.current = { startX: event.clientX, startWidth: currentWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return [ref, handlePointerDown];
}

function usePersistWidth(storageKey: string, width: number) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(storageKey, String(width)); } catch { /* ignore */ }
  }, [width]);
}

export function useDrawerResize(): DrawerResizeState {
  const [interactionDrawerWidth, setInteractionDrawerWidth] = useState(() =>
    readStoredWidth("buildwise:interaction-drawer-width", 680, getInteractionDrawerWidthBounds)
  );
  const [artifactDrawerWidth, setArtifactDrawerWidth] = useState(() =>
    readStoredWidth("buildwise:artifact-drawer-width", 760, (vw) => {
      const bounds = getArtifactDrawerWidthBounds(vw);
      return { min: bounds.min, max: Math.max(bounds.min, Math.min(bounds.max, Math.round(vw * 0.42))) };
    })
  );

  const [, handleInteractionDown] = useResizeDrag(getInteractionDrawerWidthBounds, setInteractionDrawerWidth);
  const [, handleArtifactDown] = useResizeDrag(getArtifactDrawerWidthBounds, setArtifactDrawerWidth);

  usePersistWidth("buildwise:interaction-drawer-width", interactionDrawerWidth);
  usePersistWidth("buildwise:artifact-drawer-width", artifactDrawerWidth);

  return {
    interactionDrawerWidth, setInteractionDrawerWidth,
    artifactDrawerWidth, setArtifactDrawerWidth,
    handleInteractionDrawerResizePointerDown: (e) => handleInteractionDown(e, interactionDrawerWidth),
    handleArtifactDrawerResizePointerDown: (e) => handleArtifactDown(e, artifactDrawerWidth),
  };
}
