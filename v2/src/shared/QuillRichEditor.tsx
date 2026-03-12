import { useEffect, useRef, useState } from "react";

type QuillLike = {
  root: HTMLElement;
  clipboard: { dangerouslyPasteHTML: (html: string) => void };
  on: (eventName: string, handler: () => void) => void;
  off: (eventName: string, handler: () => void) => void;
  enable: (enabled: boolean) => void;
};

declare global {
  interface Window {
    Quill?: new (element: Element, options: Record<string, unknown>) => QuillLike;
  }
}

let quillLoader: Promise<void> | null = null;

function loadQuillScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window_unavailable"));
  }
  if (window.Quill) {
    return Promise.resolve();
  }
  if (!quillLoader) {
    quillLoader = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-buildwise-quill="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("quill_load_failed")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "/vendor/quill/quill.js";
      script.async = true;
      script.dataset.buildwiseQuill = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("quill_load_failed"));
      document.head.appendChild(script);
    });
  }
  return quillLoader;
}

type QuillRichEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function QuillRichEditor({ value, onChange, placeholder, disabled, className }: QuillRichEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<QuillLike | null>(null);
  const changeHandlerRef = useRef<(() => void) | null>(null);
  const lastValueRef = useRef<string>(value || "");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadQuillScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.Quill) {
          return;
        }
        if (quillRef.current) {
          return;
        }
        const quill = new window.Quill(hostRef.current, {
          theme: "snow",
          placeholder: placeholder || "",
          modules: {
            toolbar: [
              [{ header: [2, 3, false] }],
              ["bold", "italic", "underline", "strike"],
              [{ list: "ordered" }, { list: "bullet" }],
              ["blockquote", "code-block"],
              ["link", "image", "video"],
              ["clean"]
            ]
          }
        });
        quillRef.current = quill;
        quill.clipboard.dangerouslyPasteHTML(lastValueRef.current || "");
        const handler = () => {
          const html = quill.root.innerHTML === "<p><br></p>" ? "" : quill.root.innerHTML;
          lastValueRef.current = html;
          onChange(html);
        };
        changeHandlerRef.current = handler;
        quill.on("text-change", handler);
        quill.enable(!disabled);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "quill_load_failed");
        }
      });
    return () => {
      cancelled = true;
      if (quillRef.current && changeHandlerRef.current) {
        quillRef.current.off("text-change", changeHandlerRef.current);
      }
      quillRef.current = null;
      changeHandlerRef.current = null;
    };
  }, [disabled, onChange, placeholder]);

  useEffect(() => {
    const quill = quillRef.current;
    const normalized = value || "";
    if (!quill || normalized === lastValueRef.current) {
      return;
    }
    lastValueRef.current = normalized;
    quill.clipboard.dangerouslyPasteHTML(normalized);
  }, [value]);

  useEffect(() => {
    if (!quillRef.current) {
      return;
    }
    quillRef.current.enable(!disabled);
  }, [disabled]);

  return (
    <div className={`quill-rich-editor ${className || ""}`.trim()}>
      <div ref={hostRef} />
      {loadError ? <p className="error-inline">富文本编辑器加载失败：{loadError}</p> : null}
    </div>
  );
}

