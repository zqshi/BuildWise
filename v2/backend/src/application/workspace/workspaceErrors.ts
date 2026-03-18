export class DuplicateAttachmentUploadError extends Error {
  readonly code = "duplicate_attachment_upload";

  constructor(message = "duplicate_upload") {
    super(message);
    this.name = "DuplicateAttachmentUploadError";
  }
}
