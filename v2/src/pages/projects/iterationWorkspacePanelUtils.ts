import type { ArtifactPreviewKind } from "./iterationWorkspacePanelTypes";

export function resolveArtifactPreviewKind(artifactId: string): ArtifactPreviewKind {
  if (artifactId === "analysis-report") return "analysis-report";
  if (artifactId === "product-requirements-doc") return "product-requirements-doc";
  if (artifactId === "prototype-preview") return "html-prototype";
  if (artifactId === "design-spec") return "design-spec";
  if (artifactId === "technical-architecture") return "technical-architecture";
  if (artifactId === "code-delivery" || artifactId === "frontend-code" || artifactId === "backend-code") return "code";
  if (artifactId === "test-matrix" || artifactId === "acceptance-checklist") return "test-cases";
  if (artifactId === "release-review") return "release-review";
  if (artifactId === "delivery-package") return "delivery-package";
  return "document";
}

export const getInteractionDrawerWidthBounds = (viewportWidth: number) => {
  const max = Math.max(360, Math.round(viewportWidth * 0.96));
  const min = Math.min(420, max);
  return { min, max };
};

export const getArtifactDrawerWidthBounds = (viewportWidth: number) => {
  const max = Math.max(420, Math.round(viewportWidth * 0.96));
  const min = Math.min(520, max);
  return { min, max };
};

export function patchHtmlRuntimeForPreview(content: string) {
  const guardedContent = content.replace(
    /\btailwind\.config\s*\(/g,
    "(window.tailwind && typeof window.tailwind.config === 'function' ? window.tailwind.config.bind(window.tailwind) : function(){})("
  );
  const fallbackPrelude = `
<script>
(() => {
  if (typeof window.Chart !== "function") {
    class ChartStub {
      constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.data = (config && config.data) || {};
        this.options = (config && config.options) || {};
      }
      destroy() {}
      update() {}
      resize() {}
      reset() {}
      render() {}
      stop() {}
      clear() {}
      toBase64Image() { return ""; }
    }
    ChartStub.defaults = {};
    ChartStub.instances = {};
    ChartStub.overrides = {};
    ChartStub.register = () => {};
    ChartStub.unregister = () => {};
    ChartStub.getChart = () => null;
    window.Chart = ChartStub;
  }
})();
</script>`;
  if (/<head[^>]*>/i.test(guardedContent)) {
    return guardedContent.replace(/<head([^>]*)>/i, `<head$1>${fallbackPrelude}`);
  }
  return `${fallbackPrelude}\n${guardedContent}`;
}

export function instrumentHtmlPreview(content: string, enableInteraction: boolean) {
  const runtimePatchedContent = patchHtmlRuntimeForPreview(content);
  const script = `
<script>
(() => {
  if (window.__buildwisePreviewInjected) return;
  window.__buildwisePreviewInjected = true;
  const interactionEnabled = ${enableInteraction ? "true" : "false"};
  const fitStyle = document.createElement("style");
  fitStyle.textContent = [
    "html, body { min-width: 0 !important; }",
    "body { overflow-x: hidden !important; overflow-y: auto !important; }",
    "* { box-sizing: border-box; }",
    "img, svg, canvas, video, iframe { max-width: 100% !important; height: auto; }",
    ".container, [class*='container'] { max-width: 100% !important; }",
    "body > * { max-width: 100% !important; }"
  ].join("\\n");
  if (document.head) document.head.appendChild(fitStyle);
  else document.addEventListener("DOMContentLoaded", () => document.head && document.head.appendChild(fitStyle), { once: true });
  const getContentBounds = (body) => {
    let rightEdge = 0;
    let bottomEdge = 0;
    for (const child of Array.from(body.children || [])) {
      if (!(child instanceof HTMLElement)) continue;
      const rect = child.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      rightEdge = Math.max(rightEdge, rect.right);
      bottomEdge = Math.max(bottomEdge, rect.bottom);
    }
    return {
      width: Math.max(1, Math.round(rightEdge)),
      height: Math.max(1, Math.round(bottomEdge))
    };
  };
  const applyResponsiveFit = () => {
    const docEl = document.documentElement;
    const body = document.body;
    if (!docEl || !body) return;
    const style = docEl.style;
    style.zoom = "1";
    body.style.margin = "0";
    body.style.transformOrigin = "top left";
    body.style.width = "auto";
    body.style.transform = "none";
    body.style.minHeight = "0";
    const viewportWidth = Math.max(1, docEl.clientWidth || window.innerWidth || 1);
    const bounds = getContentBounds(body);
    const fallbackWidth = Math.max(1, body.scrollWidth, docEl.scrollWidth, Math.round(body.getBoundingClientRect().width));
    const contentWidth = Math.max(1, Math.min(fallbackWidth, bounds.width || fallbackWidth));
    const scale = Math.max(0.5, Math.min(2.4, viewportWidth / contentWidth));
    body.style.transform = "scale(" + scale + ")";
    body.style.width = contentWidth + "px";
    const contentHeight = Math.max(1, bounds.height, body.scrollHeight, docEl.scrollHeight);
    body.style.minHeight = Math.ceil(contentHeight * scale) + "px";
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyResponsiveFit(), { once: true });
  } else {
    applyResponsiveFit();
  }
  window.addEventListener("load", () => applyResponsiveFit(), { once: true });
  window.addEventListener("resize", () => applyResponsiveFit());
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => applyResponsiveFit());
    ro.observe(document.documentElement);
  }
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "2147483647";
  overlay.style.border = "2px solid #2563eb";
  overlay.style.boxShadow = "0 0 0 9999px rgba(37,99,235,.08), 0 0 0 1px rgba(37,99,235,.35)";
  overlay.style.borderRadius = "8px";
  overlay.style.display = "none";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(overlay), { once: true });
  if (document.body) document.body.appendChild(overlay);
  let selectedEl = null;
  const ignoredTags = new Set(["HTML","BODY","SCRIPT","STYLE","LINK","META"]);
  const cssPath = (node) => {
    if (!node || node.nodeType !== 1) return "";
    const el = node;
    if (el.id) return "#" + el.id;
    const cls = Array.from(el.classList || []).slice(0, 2).join(".");
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  };
  const buildSelector = (node) => {
    const parts = [];
    let cur = node;
    while (cur && cur.nodeType === 1 && parts.length < 4) {
      parts.unshift(cssPath(cur));
      cur = cur.parentElement;
    }
    return parts.filter(Boolean).join(" > ").slice(0, 180);
  };
  const updateOverlay = (el) => {
    if (!el) {
      overlay.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      overlay.style.display = "none";
      return;
    }
    overlay.style.display = "block";
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
  };
  const send = (type, el) => {
    if (!el || ignoredTags.has(el.tagName)) return;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const style = window.getComputedStyle(el);
    window.parent.postMessage({
      source: "buildwise-html-preview",
      type,
      payload: {
        selector: buildSelector(el),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        styles: {
          color: style.color || "",
          backgroundColor: style.backgroundColor || "",
          fontSize: style.fontSize || "",
          fontWeight: style.fontWeight || "",
          borderRadius: style.borderRadius || "",
          padding: style.padding || "",
          margin: style.margin || ""
        }
      }
    }, "*");
  };
  if (interactionEnabled) {
    document.addEventListener("mousemove", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (selectedEl) return;
      send("hover", target);
    }, true);
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      event.preventDefault();
      event.stopPropagation();
      selectedEl = target;
      updateOverlay(selectedEl);
      send("select", selectedEl);
    }, true);
  }
  window.addEventListener("scroll", () => selectedEl && updateOverlay(selectedEl), true);
  window.addEventListener("resize", () => selectedEl && updateOverlay(selectedEl), true);
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (!data || data.source !== "buildwise-visual-edit-host") return;
    const payload = data.payload || {};
    const selector = typeof payload.selector === "string" ? payload.selector.trim() : "";
    const resolveTarget = () => {
      if (selectedEl && selectedEl.isConnected) return selectedEl;
      if (selector) {
        try {
          const found = document.querySelector(selector);
          if (found instanceof Element) return found;
        } catch {
          return null;
        }
      }
      return null;
    };
    const target = resolveTarget();
    if (!target || ignoredTags.has(target.tagName)) return;
    if (data.type === "apply-actions" && Array.isArray(payload.actions)) {
      for (const action of payload.actions) {
        if (!action || typeof action !== "object") continue;
        if (action.op === "set-text" && typeof action.value === "string") {
          target.textContent = action.value;
          continue;
        }
        if ((action.op === "set-style" || action.op === "resize") && typeof action.property === "string" && typeof action.value === "string") {
          target.style[action.property] = action.value;
          continue;
        }
        if (action.op === "toggle-visibility") {
          target.style.display = action.value === "hidden" ? "none" : "";
        }
      }
      selectedEl = target;
      updateOverlay(target);
      send("select", target);
      return;
    }
    if (data.type === "restore-snapshot" && payload.snapshot && typeof payload.snapshot === "object") {
      const snapshot = payload.snapshot;
      if (typeof snapshot.text === "string") {
        target.textContent = snapshot.text;
      }
      if (snapshot.styles && typeof snapshot.styles === "object") {
        for (const key of Object.keys(snapshot.styles)) {
          const value = snapshot.styles[key];
          if (typeof value === "string") {
            target.style[key] = value;
          }
        }
      }
      selectedEl = target;
      updateOverlay(target);
      send("select", target);
    }
  });
})();
</script>`;
  if (/<\/body>/i.test(runtimePatchedContent)) {
    return runtimePatchedContent.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${runtimePatchedContent}\n${script}`;
}
