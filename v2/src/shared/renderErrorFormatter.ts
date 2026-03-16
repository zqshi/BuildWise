export function formatRenderError(error: unknown) {
  if (error instanceof Error) {
    return {
      title: error.name || "RenderError",
      message: error.message || "Unknown render error"
    };
  }
  if (typeof error === "string" && error.trim()) {
    return {
      title: "RenderError",
      message: error.trim()
    };
  }
  return {
    title: "RenderError",
    message: "Unknown render error"
  };
}
