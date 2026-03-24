import { LlmInvocationError, LlmUnavailableError } from "../../../application/workspace/agentRunner";
import { DuplicateAttachmentUploadError, WorkspaceBindingConflictError } from "../../../application/workspace/workspaceErrors";
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
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (/^llm_http_\d+/i.test(message) || /^llm_/i.test(message)) {
    return 502;
  }
  // fetch AbortError (timeout) → 502
  if (name === "AbortError" || /aborted/i.test(message)) {
    return 502;
  }
  // Network connectivity errors → 502
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(message)) {
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
  if (error instanceof WorkspaceBindingConflictError) {
    return { code: 409, message: "workspace_path_already_bound" };
  }
  const llmStatus = resolveLlmErrorStatus(error);
  if (llmStatus) {
    return { code: llmStatus, message: resolveErrorMessage(error) };
  }
  return null;
}
