import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  PrototypeElement,
  PrototypeChangeHistoryItem,
  ImageSelectionRegion,
} from "./iterationWorkspacePanelTypes";

export type PrototypeInteractionState = {
  selectedImagePoint: { xPercent: number; yPercent: number } | null;
  setSelectedImagePoint: React.Dispatch<React.SetStateAction<{ xPercent: number; yPercent: number } | null>>;
  selectedImageRegion: ImageSelectionRegion | null;
  setSelectedImageRegion: React.Dispatch<React.SetStateAction<ImageSelectionRegion | null>>;
  dragImageRegion: ImageSelectionRegion | null;
  setDragImageRegion: React.Dispatch<React.SetStateAction<ImageSelectionRegion | null>>;
  imageWrapRef: React.MutableRefObject<HTMLButtonElement | null>;
  toPercentPoint: (clientX: number, clientY: number) => { xPercent: number; yPercent: number } | null;
  handleImagePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleImagePointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleImagePointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleImagePointerCancel: () => void;
  finalizeImageSelection: (clientX: number, clientY: number) => void;
  applyPrototypeInstruction: (
    instruction: string,
    selectedElement: PrototypeElement | null,
    setPrototypeElements: React.Dispatch<React.SetStateAction<PrototypeElement[]>>,
    setPrototypeLastPlan: React.Dispatch<React.SetStateAction<string[]>>,
    setPrototypeHistory: React.Dispatch<React.SetStateAction<PrototypeChangeHistoryItem[]>>,
  ) => { applied: boolean; summary: string; plan: string[] };
};

export function usePrototypeInteraction(
  interactionEditMode: boolean,
): PrototypeInteractionState {
  const [selectedImagePoint, setSelectedImagePoint] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [selectedImageRegion, setSelectedImageRegion] = useState<ImageSelectionRegion | null>(null);
  const [dragImageRegion, setDragImageRegion] = useState<ImageSelectionRegion | null>(null);

  const imageWrapRef = useRef<HTMLButtonElement | null>(null);
  const imageDragStartRef = useRef<{ x: number; y: number } | null>(null);

  const toPercentPoint = (clientX: number, clientY: number) => {
    const el = imageWrapRef.current;
    if (!el) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return {
      xPercent: (x / rect.width) * 100,
      yPercent: (y / rect.height) * 100,
    };
  };

  const handleImagePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!interactionEditMode) {
      return;
    }
    const point = toPercentPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    imageDragStartRef.current = { x: point.xPercent, y: point.yPercent };
    setDragImageRegion({
      xPercent: point.xPercent,
      yPercent: point.yPercent,
      widthPercent: 0,
      heightPercent: 0,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleImagePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!interactionEditMode || !imageDragStartRef.current) {
      return;
    }
    const point = toPercentPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const start = imageDragStartRef.current;
    const xPercent = Math.min(start.x, point.xPercent);
    const yPercent = Math.min(start.y, point.yPercent);
    const widthPercent = Math.abs(point.xPercent - start.x);
    const heightPercent = Math.abs(point.yPercent - start.y);
    setDragImageRegion({ xPercent, yPercent, widthPercent, heightPercent });
  };

  const finalizeImageSelection = (clientX: number, clientY: number) => {
    const point = toPercentPoint(clientX, clientY);
    const start = imageDragStartRef.current;
    const draft = dragImageRegion;
    imageDragStartRef.current = null;
    setDragImageRegion(null);
    if (!point || !start) {
      return;
    }
    if (draft && (draft.widthPercent >= 1.2 || draft.heightPercent >= 1.2)) {
      setSelectedImageRegion(draft);
      setSelectedImagePoint(null);
      return;
    }
    setSelectedImagePoint(point);
    setSelectedImageRegion(null);
  };

  const handleImagePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!interactionEditMode) {
      return;
    }
    finalizeImageSelection(event.clientX, event.clientY);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // releasePointerCapture 在 pointer 已释放时会抛异常，安全忽略
    }
  };

  const handleImagePointerCancel = () => {
    if (!interactionEditMode) {
      return;
    }
    imageDragStartRef.current = null;
    setDragImageRegion(null);
  };

  const applyPrototypeInstruction = (
    instruction: string,
    selected: PrototypeElement | null,
    setPrototypeElements: React.Dispatch<React.SetStateAction<PrototypeElement[]>>,
    setPrototypeLastPlan: React.Dispatch<React.SetStateAction<string[]>>,
    setPrototypeHistory: React.Dispatch<React.SetStateAction<PrototypeChangeHistoryItem[]>>,
  ): { applied: boolean; summary: string; plan: string[] } => {
    const normalized = instruction.trim();
    if (!selected || !normalized) {
      return { applied: false, summary: "未识别有效修改。", plan: [] as string[] };
    }
    const colorMap: Record<string, { background: string; color: string }> = {
      蓝色: { background: "#2563eb", color: "#ffffff" },
      绿色: { background: "#16a34a", color: "#ffffff" },
      橙色: { background: "#ea580c", color: "#ffffff" },
      红色: { background: "#dc2626", color: "#ffffff" },
      灰色: { background: "#475569", color: "#ffffff" },
    };
    const quotedText = normalized.match(/[""](.+?)[""]/)?.[1];
    const renamedText =
      quotedText ||
      normalized.match(/(?:改成|改为|改名为|文案改为)\s*[:：]?\s*(.+)$/)?.[1]?.trim() ||
      "";
    const next = { ...selected };
    const plan: string[] = [];
    if (renamedText && renamedText !== selected.label) {
      next.label = renamedText;
      plan.push(`文案 → ${renamedText}`);
    }
    if (/隐藏|删除|移除/.test(normalized) && selected.visible) {
      next.visible = false;
      plan.push("可见性 → 隐藏");
    }
    if (/显示|恢复/.test(normalized) && !selected.visible) {
      next.visible = true;
      plan.push("可见性 → 显示");
    }
    if (/加粗|强调/.test(normalized) && !selected.emphasized) {
      next.emphasized = true;
      plan.push("强调状态 → 开启");
    }
    if (/取消加粗|去强调/.test(normalized) && selected.emphasized) {
      next.emphasized = false;
      plan.push("强调状态 → 关闭");
    }
    const widthMatch = normalized.match(/宽(?:度)?\s*(\d{2,4})/);
    if (widthMatch) {
      const width = Math.max(120, Math.min(900, Number(widthMatch[1])));
      if (width !== selected.width) {
        next.width = width;
        plan.push(`宽度 → ${width}`);
      }
    }
    const heightMatch = normalized.match(/高(?:度)?\s*(\d{2,4})/);
    if (heightMatch) {
      const height = Math.max(32, Math.min(600, Number(heightMatch[1])));
      if (height !== selected.height) {
        next.height = height;
        plan.push(`高度 → ${height}`);
      }
    }
    if (/变大|放大/.test(normalized)) {
      const width = Math.min(900, next.width + 40);
      const height = Math.min(600, next.height + 10);
      if (width !== next.width || height !== next.height) {
        next.width = width;
        next.height = height;
        plan.push(`尺寸 → ${width}×${height}`);
      }
    }
    if (/变小|缩小/.test(normalized)) {
      const width = Math.max(120, next.width - 40);
      const height = Math.max(32, next.height - 10);
      if (width !== next.width || height !== next.height) {
        next.width = width;
        next.height = height;
        plan.push(`尺寸 → ${width}×${height}`);
      }
    }
    for (const [key, color] of Object.entries(colorMap)) {
      if (normalized.includes(key) && (next.background !== color.background || next.color !== color.color)) {
        next.background = color.background;
        next.color = color.color;
        plan.push(`配色 → ${key}`);
      }
    }
    if (plan.length === 0) {
      setPrototypeLastPlan(["未识别到可执行属性变更（可尝试：文案、颜色、宽高、显隐、强调）。"]);
      return { applied: false, summary: "未识别有效修改。", plan: [] as string[] };
    }
    setPrototypeElements((prev) => prev.map((item) => (item.id === selected.id ? next : item)));
    setPrototypeLastPlan(plan);
    const summary = plan.join("；");
    const historyItem: PrototypeChangeHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      targetId: selected.id,
      targetLabel: selected.label,
      instruction: normalized,
      summary,
      before: selected,
      after: next,
      at: new Date().toISOString(),
    };
    setPrototypeHistory((prev) => [historyItem, ...prev].slice(0, 20));
    return { applied: true, summary, plan };
  };

  return {
    selectedImagePoint,
    setSelectedImagePoint,
    selectedImageRegion,
    setSelectedImageRegion,
    dragImageRegion,
    setDragImageRegion,
    imageWrapRef,
    toPercentPoint,
    handleImagePointerDown,
    handleImagePointerMove,
    handleImagePointerUp,
    handleImagePointerCancel,
    finalizeImageSelection,
    applyPrototypeInstruction,
  };
}
