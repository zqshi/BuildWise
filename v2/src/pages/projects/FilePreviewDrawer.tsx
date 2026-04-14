import { downloadSingleFile } from "./UploadFileCard";
import type { UploadFileEntry } from "./UploadFileCard";

/** Resolve a local resource path against sibling files (handles ./prefix, folder/file, bare name) */
function findSiblingByRef(ref: string, siblings: UploadFileEntry[]): UploadFileEntry | undefined {
  const normalized = ref.replace(/^\.\//, "");
  return siblings.find((f) => {
    const p = (f.path || f.name).replace(/^\.\//, "");
    return p === normalized || p.endsWith(`/${normalized}`) || f.name === normalized;
  });
}

/** Inline local <script src> and <link href> references from sibling uploaded files */
function inlineHtmlResources(html: string, siblings: UploadFileEntry[]): string {
  if (siblings.length === 0) return html;
  // Inline <script src="local.js"> → <script>...content...</script>
  let result = html.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (original, src: string) => {
      if (/^https?:\/\//i.test(src)) return original;
      const sibling = findSiblingByRef(src, siblings);
      if (sibling?.content) return `<script>${sibling.content}<\/script>`;
      return original;
    }
  );
  // Inline <link rel="stylesheet" href="local.css"> → <style>...content...</style>
  result = result.replace(
    /<link\s+[^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
    (original, href: string) => {
      if (/^https?:\/\//i.test(href)) return original;
      if (!/rel=["']stylesheet["']/i.test(original)) return original;
      const sibling = findSiblingByRef(href, siblings);
      if (sibling?.content) return `<style>${sibling.content}</style>`;
      return original;
    }
  );
  return result;
}

export interface FilePreviewDrawerProps {
  previewFile: UploadFileEntry;
  previewSiblingFiles: UploadFileEntry[];
  artifactDrawerWidth: number;
  handleArtifactDrawerResizePointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onClose: () => void;
}

export function FilePreviewDrawer({
  previewFile,
  previewSiblingFiles,
  artifactDrawerWidth,
  handleArtifactDrawerResizePointerDown,
  onClose,
}: FilePreviewDrawerProps) {
  return (
    <>
      <div className="analysis-drawer-mask open" onClick={onClose} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} aria-label="关闭" />
      <aside className="panel preview-panel context-panel artifact-preview-panel analysis-drawer open" style={{ width: `min(${artifactDrawerWidth}px, 100vw)` }}>
        <article className="analysis-drawer-inner" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="artifact-drawer-resize-handle" onPointerDown={handleArtifactDrawerResizePointerDown} />
          <div className="panel-head analysis-drawer-head">
            <div>
              <h2>{previewFile.name}</h2>
              <div className="file-preview-meta">
                {previewFile.size > 0 ? <span className="upload-file-size">{previewFile.size < 1024 ? `${previewFile.size} B` : previewFile.size < 1048576 ? `${(previewFile.size / 1024).toFixed(1)} KB` : `${(previewFile.size / 1048576).toFixed(1)} MB`}</span> : null}
                <span className="upload-file-chip">{previewFile.type || "文件"}</span>
              </div>
            </div>
            <div className="chat-tools">
              {(previewFile.content || previewFile.dataUrl) ? (
                <button type="button" className="btn ghost mini" onClick={() => downloadSingleFile(previewFile)}>下载</button>
              ) : null}
              <button type="button" className="icon-btn" aria-label="关闭预览" onClick={onClose}>✕</button>
            </div>
          </div>
          <div className={`preview-scroll file-preview-body${/\.html?$/i.test(previewFile.name) && previewFile.content ? " file-preview-body-iframe" : ""}`}>
            {previewFile.dataUrl?.startsWith("data:image/") ? (
              <img src={previewFile.dataUrl} alt={previewFile.name} className="file-preview-image" />
            ) : /\.html?$/i.test(previewFile.name) && previewFile.content ? (
              <iframe
                title={previewFile.name}
                className="file-preview-iframe"
                sandbox="allow-scripts"
                srcDoc={inlineHtmlResources(previewFile.content, previewSiblingFiles)}
              />
            ) : previewFile.content ? (
              <pre className="file-preview-text">{previewFile.content}</pre>
            ) : (
              <p className="file-preview-empty">该文件无法预览</p>
            )}
          </div>
        </article>
      </aside>
    </>
  );
}
