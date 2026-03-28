import { useState } from "react";

type UploadFileMeta = {
  kind: string;
  sourceType: "folder" | "single-file";
  folderName?: string;
  totalFiles: number;
  files: Array<{
    name: string;
    path: string;
    size: number;
    type: string;
  }>;
};

export function parseUploadMeta(content: string): UploadFileMeta | null {
  const match = content.match(/<!-- upload:(.*?) -->/s);
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

const MAX_VISIBLE_FILES = 8;

export function UploadFileCard({ meta }: { meta: UploadFileMeta }) {
  const [expanded, setExpanded] = useState(false);
  const isFolder = meta.sourceType === "folder";
  const visibleFiles = expanded ? meta.files : meta.files.slice(0, MAX_VISIBLE_FILES);
  const hasMore = meta.files.length > MAX_VISIBLE_FILES;
  const remainingCount = meta.totalFiles > meta.files.length
    ? meta.totalFiles - meta.files.length
    : meta.files.length - MAX_VISIBLE_FILES;

  if (!isFolder && meta.files.length === 1) {
    const file = meta.files[0];
    const icon = resolveFileIcon(file.name, file.type);
    const size = formatFileSize(file.size);
    const typeLabel = resolveTypeLabel(file.name, file.type);
    return (
      <div className="upload-file-card upload-file-card-single">
        <div className="upload-file-card-row">
          <span className="upload-file-icon" aria-hidden="true">{icon}</span>
          <span className="upload-file-name">{file.name}</span>
          {size ? <span className="upload-file-size">{size}</span> : null}
          <span className="upload-file-chip">{typeLabel}</span>
        </div>
        <div className="upload-file-card-footer">文件已提交分析</div>
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
        {visibleFiles.map((file) => {
          const icon = resolveFileIcon(file.name, file.type);
          const size = formatFileSize(file.size);
          const typeLabel = resolveTypeLabel(file.name, file.type);
          return (
            <div key={file.path} className="upload-file-card-row">
              <span className="upload-file-icon" aria-hidden="true">{icon}</span>
              <span className="upload-file-name" title={file.path}>{file.name}</span>
              {size ? <span className="upload-file-size">{size}</span> : null}
              <span className="upload-file-chip">{typeLabel}</span>
            </div>
          );
        })}
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
      <div className="upload-file-card-footer">文件已提交分析</div>
    </div>
  );
}
