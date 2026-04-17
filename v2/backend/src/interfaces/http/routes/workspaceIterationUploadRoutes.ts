import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";

type IdParams = { id: string };

const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

function parseUploadInitBody(body: {
  sourceType?: "single-file" | "folder"; folderName?: string; idempotencyKey?: string;
  files?: Array<{ path?: string; fileName?: string; mimeType?: string; size?: number; sha256?: string; chunkCount?: number }>;
} | null) {
  const idempotencyKey = body?.idempotencyKey?.trim() || "";
  if (!idempotencyKey) return { input: null as null, error: "idempotencyKey is required" };
  const files = Array.isArray(body?.files)
    ? body.files.map((item) => ({
        path: typeof item?.path === "string" ? item.path.slice(0, 260) : "",
        fileName: typeof item?.fileName === "string" ? item.fileName.slice(0, 120) : "",
        mimeType: typeof item?.mimeType === "string" ? item.mimeType.slice(0, 120) : "application/octet-stream",
        size: typeof item?.size === "number" && Number.isFinite(item.size) ? item.size : 0,
        sha256: typeof item?.sha256 === "string" ? item.sha256.slice(0, 128) : "",
        chunkCount: typeof item?.chunkCount === "number" && Number.isFinite(item.chunkCount) ? Math.max(1, Math.floor(item.chunkCount)) : 1,
      })).filter((item) => item.fileName.trim().length > 0)
    : [];
  if (files.length === 0) return { input: null as null, error: "files[] is required" };
  const sourceType: "single-file" | "folder" = body?.sourceType === "folder" ? "folder" : "single-file";
  return { input: { sourceType, folderName: body?.folderName?.trim() || "", idempotencyKey, files }, error: "" };
}

function formatUploadFiles(files: Array<{ fileId: string; fileName: string; path: string; chunkBitmap: boolean[]; chunkCount?: number }>, includeChunkCount: boolean) {
  return files.map((item) => ({
    fileId: item.fileId, fileName: item.fileName, path: item.path,
    ...(includeChunkCount ? { chunkCount: item.chunkCount } : {}),
    missingChunkIndexes: item.chunkBitmap.map((ok, idx) => (!ok ? idx : -1)).filter((idx) => idx >= 0),
  }));
}

async function handleInitUpload(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const iterationId = parsePositiveInt((request.params as IdParams).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const parsed = parseUploadInitBody(request.body as Parameters<typeof parseUploadInitBody>[0]);
  if (!parsed.input) { reply.code(400); return { message: parsed.error }; }
  const created = service.upload.initAttachmentUpload(iterationId, parsed.input);
  if (!created) { reply.code(404); return { message: "迭代不存在" }; }
  return { uploadId: created.uploadId, status: created.status, sourceType: created.sourceType, files: formatUploadFiles(created.files, false) };
}

async function handleGetUploadStatus(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; uploadId: string };
  const iterationId = parsePositiveInt(params.id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const upload = service.upload.getAttachmentUpload(iterationId, params.uploadId);
  if (!upload) { reply.code(404); return { message: "上传记录不存在" }; }
  return { uploadId: upload.uploadId, status: upload.status, files: formatUploadFiles(upload.files, true) };
}

async function handlePutChunk(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const params = request.params as { id: string; uploadId: string; fileId: string; chunkIndex: string };
  const iterationId = parsePositiveInt(params.id);
  const chunkIndex = parsePositiveInt(params.chunkIndex);
  if (iterationId === null || chunkIndex === null) { reply.code(400); return { message: "无效的路径参数" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const dataBase64 = ((request.body as { dataBase64?: string } | null)?.dataBase64 || "").trim();
  if (!dataBase64) { reply.code(400); return { message: "请提供文件分片数据" }; }
  let chunk: Uint8Array;
  try { chunk = Buffer.from(dataBase64, "base64"); } catch { reply.code(400); return { message: "无效的文件分片数据" }; }
  const ok = service.upload.putAttachmentUploadChunk(iterationId, params.uploadId, params.fileId, chunkIndex - 1, chunk);
  if (!ok) { reply.code(404); return { message: "上传文件或分片不存在" }; }
  reply.code(204); return null;
}

async function handleCompleteUpload(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const iterationId = parsePositiveInt((request.params as { id: string; uploadId: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const uploadId = (request.params as { uploadId: string }).uploadId;
  const completed = service.upload.completeAttachmentUpload(iterationId, uploadId);
  if (!completed) { reply.code(404); return { message: "上传不存在或未完成" }; }
  return { uploadId: completed.upload.uploadId, status: completed.upload.status, ingestJobId: completed.ingestJob.ingestJobId };
}

const UPLOAD_PARAM_SCHEMA = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" }, uploadId: { type: "string" as const, minLength: 1 } },
  required: ["id" as const, "uploadId" as const]
};

const CHUNK_PARAM_SCHEMA = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, pattern: "^\\d+$" }, uploadId: { type: "string" as const, minLength: 1 },
    fileId: { type: "string" as const, minLength: 1 }, chunkIndex: { type: "string" as const, pattern: "^\\d+$" },
  },
  required: ["id" as const, "uploadId" as const, "fileId" as const, "chunkIndex" as const]
};

export function registerWorkspaceIterationUploadRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/uploads/init", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object" } }
  }, (req, rep) => handleInitUpload(service, req, rep));

  app.get("/iterations/:id/uploads/:uploadId/status", {
    schema: { params: UPLOAD_PARAM_SCHEMA }
  }, (req, rep) => handleGetUploadStatus(service, req, rep));

  app.put("/iterations/:id/uploads/:uploadId/files/:fileId/chunks/:chunkIndex", {
    schema: { params: CHUNK_PARAM_SCHEMA, body: { type: "object", properties: { dataBase64: { type: "string" } }, required: ["dataBase64"], additionalProperties: false } }
  }, (req, rep) => handlePutChunk(service, req, rep));

  app.post("/iterations/:id/uploads/:uploadId/complete", {
    schema: { params: UPLOAD_PARAM_SCHEMA }
  }, (req, rep) => handleCompleteUpload(service, req, rep));
}
