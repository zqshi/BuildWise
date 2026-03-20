export function resolveErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
