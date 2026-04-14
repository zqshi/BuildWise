export class DuplicateAttachmentUploadError extends Error {
  readonly code = "duplicate_attachment_upload";

  constructor(message = "duplicate_upload") {
    super(message);
    this.name = "DuplicateAttachmentUploadError";
  }
}

export class WorkspaceBindingConflictError extends Error {
  readonly code = "workspace_binding_conflict";

  constructor(message = "workspace_path_already_bound") {
    super(message);
    this.name = "WorkspaceBindingConflictError";
  }
}
