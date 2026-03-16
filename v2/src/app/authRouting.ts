export type AppRoute = "marketing" | "login" | "workspace";

export function resolveAppRoute(hash: string): AppRoute {
  if (hash === "#/login") {
    return "login";
  }
  if (hash === "" || hash === "#" || hash === "#/" || hash === "#/home") {
    return "marketing";
  }
  return "workspace";
}
