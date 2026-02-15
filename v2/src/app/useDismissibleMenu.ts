import { useEffect } from "react";
import type { RefObject } from "react";

type UseDismissibleMenuParams = {
  open: boolean;
  menuRef: RefObject<HTMLDivElement>;
  onClose: () => void;
};

export function useDismissibleMenu({ open, menuRef, onClose }: UseDismissibleMenuParams) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!open) {
        return;
      }
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, menuRef, onClose]);

  useEffect(() => {
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscClose);
    return () => document.removeEventListener("keydown", handleEscClose);
  }, [onClose]);
}
