import { LlmInvocationError, LlmUnavailableError } from "../../../application/workspace/agentRunner";
import { DuplicateAttachmentUploadError } from "../../../application/workspace/workspaceErrors";
import { resolveErrorMessage } from "../../../shared/utils";

export function parsePositiveInt(value: string | undefined) {
  if (!value) return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function currentRole(authRole: string | undefined) {
  const role = authRole?.trim().toLowerCase() || "viewer";
  return role === "admin" ? "owner" : role;
}

export function isAdmin(role: string) {
  return role === "owner";
}

export function isValidPhone(phone: string) {
  return /^1\d{10}$/.test(phone);
}

export function resolveLlmErrorStatus(error: unknown): 502 | 503 | null {
  if (error instanceof LlmUnavailableError) {
    return 503;
  }
  if (error instanceof LlmInvocationError) {
    return 502;
  }
  const message = error instanceof Error ? error.message : "";
  if (/^llm_http_\d+/i.test(message) || /^llm_/i.test(message)) {
    return 502;
  }
  return null;
}

/**
 * Centralized route error handler.
 * Returns `{ code, message }` when the error is recognized, or `null` to let the caller re-throw.
 */
export function handleRouteError(error: unknown): { code: number; message: string } | null {
  if (error instanceof DuplicateAttachmentUploadError) {
    return { code: 409, message: "duplicate_upload" };
  }
  const llmStatus = resolveLlmErrorStatus(error);
  if (llmStatus) {
    return { code: llmStatus, message: resolveErrorMessage(error) };
  }
  return null;
}
