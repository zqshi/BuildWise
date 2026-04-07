import type { AttachmentUploadInput } from "../../domain/workspace/types";

export function buildDeepInsightsFileManifest(input: AttachmentUploadInput) {
  const sourceFiles =
    input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
      ? input.files.slice(0, 300)
      : [
          {
            path: input.fileName || "attachment",
            fileName: input.fileName || "attachment",
            mimeType: input.mimeType || "application/octet-stream",
            size: input.size || 0,
            excerpt: input.excerpt || ""
          }
        ];
  return sourceFiles
    .map((item, index) => {
      const path = (item.path || item.fileName || "").trim() || `file-${index + 1}`;
      const fileName = (item.fileName || path.split("/").pop() || path).trim();
      const mimeType = (item.mimeType || "application/octet-stream").trim();
      const size = Number.isFinite(item.size) ? item.size : 0;
      const excerpt = (item.excerpt || "").trim().slice(0, 800);
      return `[${index + 1}] path=${path};fileName=${fileName};mime=${mimeType};size=${size}\nexcerpt=${excerpt || "[empty]"}`;
    })
    .join("\n\n---\n\n");
}
