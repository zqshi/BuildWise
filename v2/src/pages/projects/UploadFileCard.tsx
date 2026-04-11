import { useState } from "react";

type UploadFileEntry = {
  name: string;
  path: string;
  size: number;
  type: string;
  content?: string;
  dataUrl?: string;
};

type UploadFileMeta = {
  kind: string;
  sourceType: "folder" | "single-file";
  folderName?: string;
  totalFiles: number;
  files: UploadFileEntry[];
};

export type { UploadFileEntry, UploadFileMeta };

export function parseUploadMeta(content: string): UploadFileMeta | null {
  const b64Match = content.match(/<!-- upload-b64:([\w+/=]+) -->/);
  if (b64Match) {
    try {
      return JSON.parse(decodeURIComponent(escape(atob(b64Match[1])))) as UploadFileMeta;
    } catch {
      return null;
    }
  }
  const match = content.match(/<!-- upload:(.*) -->/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as UploadFileMeta;
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveFileIcon(name: string, type: string): string {
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower) || type.startsWith("image/")) return "\u{1F5BC}";
  if (/\.(html?|css|js|ts|jsx|tsx|json|xml)$/.test(lower)) return "\u{1F4C4}";
  if (/\.(pdf)$/.test(lower) || type.includes("pdf")) return "\u{1F4D1}";
  if (/\.(doc|docx)$/.test(lower) || type.includes("word")) return "\u{1F4DD}";
  if (/\.(md|txt)$/.test(lower) || type.startsWith("text/")) return "\u{1F4C3}";
  if (/\.(fig|sketch|xd)$/.test(lower)) return "\u{1F3A8}";
  if (/\.(zip|tar|gz|rar|7z)$/.test(lower)) return "\u{1F4E6}";
  return "\u{1F4C4}";
}

function resolveTypeLabel(name: string, type: string): string {
  const lower = name.toLowerCase();
  if (/\.pdf$/.test(lower)) return "PDF";
  if (/\.docx?$/.test(lower)) return "Word";
  if (/\.md$/.test(lower)) return "Markdown";
  if (/\.txt$/.test(lower)) return "文本";
  if (/\.html?$/.test(lower)) return "HTML";
  if (/\.css$/.test(lower)) return "CSS";
  if (/\.tsx?$/.test(lower)) return "TypeScript";
  if (/\.jsx?$/.test(lower)) return "JavaScript";
  if (/\.json$/.test(lower)) return "JSON";
  if (/\.png$/.test(lower)) return "PNG";
  if (/\.jpe?g$/.test(lower)) return "JPEG";
  if (/\.svg$/.test(lower)) return "SVG";
  if (/\.gif$/.test(lower)) return "GIF";
  if (/\.webp$/.test(lower)) return "WebP";
  if (/\.fig$/.test(lower)) return "Figma";
  if (/\.sketch$/.test(lower)) return "Sketch";
  if (/\.xd$/.test(lower)) return "XD";
  if (type) {
    const sub = type.split("/")[1];
    if (sub) return sub.toUpperCase().slice(0, 8);
  }
  return "文件";
}

export function hasPreviewableContent(file: UploadFileEntry): boolean {
  return Boolean(file.content || file.dataUrl);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadSingleFile(file: UploadFileEntry) {
  if (file.content) {
    downloadBlob(new Blob([file.content], { type: file.type || "text/plain" }), file.name);
  } else if (file.dataUrl) {
    const arr = file.dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || file.type;
    const bstr = atob(arr[1]);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    downloadBlob(new Blob([u8], { type: mime }), file.name);
  }
}

export async function downloadAllAsZip(folderName: string, files: UploadFileEntry[]) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const f of files) {
    if (f.content) {
      zip.file(f.path || f.name, f.content);
    } else if (f.dataUrl) {
      const base64 = f.dataUrl.split(",")[1];
      if (base64) zip.file(f.path || f.name, base64, { base64: true });
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${folderName || "files"}.zip`);
}

const MAX_VISIBLE_FILES = 8;

function FileRow({
  file,
  onPreview,
}: {
  file: UploadFileEntry;
  onPreview: (f: UploadFileEntry) => void;
}) {
  const icon = resolveFileIcon(file.name, file.type);
  const size = formatFileSize(file.size);
  const typeLabel = resolveTypeLabel(file.name, file.type);
  const canPreview = hasPreviewableContent(file);

  return (
    <div className="upload-file-card-row">
      <span className="upload-file-icon" aria-hidden="true">{icon}</span>
      {canPreview ? (
        <button
          type="button"
          className="upload-file-name upload-file-name-link"
          onClick={() => onPreview(file)}
          title="点击预览"
        >
          {file.name}
        </button>
      ) : (
        <span className="upload-file-name" title={file.path}>{file.name}</span>
      )}
      {size ? <span className="upload-file-size">{size}</span> : null}
      <span className="upload-file-chip">{typeLabel}</span>
    </div>
  );
}

export function UploadFileCard({
  meta,
  onPreviewFile,
}: {
  meta: UploadFileMeta;
  onPreviewFile: (file: UploadFileEntry, siblings?: UploadFileEntry[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isFolder = meta.sourceType === "folder";
  const visibleFiles = expanded ? meta.files : meta.files.slice(0, MAX_VISIBLE_FILES);
  const hasMore = meta.files.length > MAX_VISIBLE_FILES;
  const remainingCount = meta.totalFiles > meta.files.length
    ? meta.totalFiles - meta.files.length
    : meta.files.length - MAX_VISIBLE_FILES;

  const downloadableFiles = meta.files.filter((f) => f.content || f.dataUrl);
  const handlePreview = (file: UploadFileEntry) => onPreviewFile(file, meta.files);

  if (!isFolder && meta.files.length === 1) {
    const file = meta.files[0];
    const canPreview = hasPreviewableContent(file);
    return (
      <div className="upload-file-card upload-file-card-single">
        <FileRow file={file} onPreview={handlePreview} />
        <div className="upload-file-card-footer">
          {canPreview ? (
            <div className="upload-file-actions">
              <button type="button" className="btn ghost mini" onClick={() => handlePreview(file)}>
                预览
              </button>
              <button type="button" className="btn ghost mini" onClick={() => downloadSingleFile(file)}>
                下载
              </button>
            </div>
          ) : (
            <span>文件已提交分析</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="upload-file-card upload-file-card-folder">
      <div className="upload-file-card-header">
        <span className="upload-file-icon" aria-hidden="true">{"\u{1F4C1}"}</span>
        <strong>{isFolder && meta.folderName ? meta.folderName : "上传文件"}</strong>
        <span className="upload-file-count">{meta.totalFiles} 个文件</span>
      </div>
      <div className="upload-file-list">
        {visibleFiles.map((file) => (
          <FileRow key={file.path} file={file} onPreview={handlePreview} />
        ))}
        {hasMore && !expanded ? (
          <button type="button" className="upload-file-expand-btn" onClick={() => setExpanded(true)}>
            展开全部（还有 {remainingCount} 个文件）
          </button>
        ) : null}
        {hasMore && expanded ? (
          <button type="button" className="upload-file-expand-btn" onClick={() => setExpanded(false)}>
            收起
          </button>
        ) : null}
      </div>
      <div className="upload-file-card-footer">
        {downloadableFiles.length > 0 ? (
          <div className="upload-file-actions">
            <button
              type="button"
              className="btn ghost mini"
              onClick={() => downloadAllAsZip(meta.folderName || "files", downloadableFiles)}
            >
              下载全部（{meta.totalFiles} 个文件）
            </button>
            {downloadableFiles.length < meta.totalFiles ? (
              <span className="upload-file-hint">
                其中 {meta.totalFiles - downloadableFiles.length} 个二进制文件无法预览下载
              </span>
            ) : null}
          </div>
        ) : (
          <span>文件已提交分析</span>
        )}
      </div>
    </div>
  );
}
