export function formatRenderError(error: unknown) {
  if (error instanceof Error) {
    return {
      title: error.name || "RenderError",
      message: error.message || "界面渲染异常"
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
    message: "界面渲染异常"
  };
}
