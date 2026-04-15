import type { FastifyInstance } from "fastify";
import type { AttachmentUploadInput } from "../../../domain/workspace/types";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { registerIterationMessageRoutes } from "./workspaceIterationMessageRoutes";
import { registerIterationAgentRoutes } from "./workspaceIterationAgentRoutes";
import { registerIterationAnalysisRoutes } from "./workspaceIterationAnalysisRoutes";

export function parseAttachmentUploadInput(body: {
  fileName?: string;
  mimeType?: string;
  size?: number;
  excerpt?: string;
  sourceType?: "single-file" | "folder";
  folderName?: string;
  files?: Array<{ path?: string; fileName?: string; mimeType?: string; size?: number; excerpt?: string; imageDataUrl?: string }>;
  visionPayloads?: Array<{ path?: string; mimeType?: string; dataUrl?: string }>;
  excerptChunks?: string[];
  excerptDigest?: string;
  excerptStrategy?: "direct" | "chunked-head-middle-tail" | "binary-no-text" | "folder-batch";
  agentScope?: "attachment" | "iteration" | "full-cycle" | "release";
  forceMultiAgent?: boolean;
  autoTransition?: boolean;
} | null): { input: AttachmentUploadInput | null; error: string } {
  const fileName = body?.fileName?.trim();
  if (!fileName) {
    return { input: null, error: "fileName is required" };
  }
  if (body?.sourceType === "folder" && (!Array.isArray(body.files) || body.files.length === 0)) {
    return { input: null, error: "files[] is required when sourceType=folder" };
  }
  return {
    input: {
      fileName,
      mimeType: body?.mimeType?.trim() || "application/octet-stream",
      size: typeof body?.size === "number" && Number.isFinite(body.size) ? body.size : 0,
      excerpt: body?.excerpt?.slice(0, 8000) || "",
      sourceType: body?.sourceType === "folder" ? "folder" : "single-file",
      folderName: body?.folderName?.trim() || "",
      files: Array.isArray(body?.files)
        ? body.files
            .map((item) => ({
              path: typeof item?.path === "string" ? item.path.slice(0, 260) : "",
              fileName: typeof item?.fileName === "string" ? item.fileName.slice(0, 120) : "",
              mimeType: typeof item?.mimeType === "string" ? item.mimeType.slice(0, 120) : "application/octet-stream",
              size: typeof item?.size === "number" && Number.isFinite(item.size) ? item.size : 0,
              excerpt: typeof item?.excerpt === "string" ? item.excerpt.slice(0, 1200) : "",
              imageDataUrl: typeof item?.imageDataUrl === "string" ? item.imageDataUrl.slice(0, 300000) : ""
            }))
            .filter((item) => item.fileName.trim().length > 0)
            .slice(0, 1000)
        : [],
      visionPayloads: Array.isArray(body?.visionPayloads)
        ? body.visionPayloads
            .map((item) => ({
              path: typeof item?.path === "string" ? item.path.slice(0, 260) : "",
              mimeType: typeof item?.mimeType === "string" ? item.mimeType.slice(0, 120) : "image/*",
              dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl.slice(0, 300000) : ""
            }))
            .filter((item) => item.dataUrl.startsWith("data:image/"))
            .slice(0, 2)
        : [],
      excerptChunks: Array.isArray(body?.excerptChunks)
        ? body.excerptChunks
            .map((item) => String(item).slice(0, 2000))
            .filter((item) => item.trim())
            .slice(0, 8)
        : [],
      excerptDigest: body?.excerptDigest?.slice(0, 300) || "",
      excerptStrategy: body?.excerptStrategy,
      agentScope: body?.agentScope,
      forceMultiAgent: Boolean(body?.forceMultiAgent),
      autoTransition: Boolean(body?.autoTransition)
    },
    error: ""
  };
}

export function registerWorkspaceIterationCoreRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerIterationMessageRoutes(app, service);
  registerIterationAgentRoutes(app, service);
  registerIterationAnalysisRoutes(app, service);
}
