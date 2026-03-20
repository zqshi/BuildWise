import { resolveErrorMessage } from "./resolveErrorMessage";

interface BusyDeps {
  setBusy: (v: boolean) => void;
  setError: (msg: string) => void;
}

export async function withBusyAction(
  deps: BusyDeps,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    deps.setBusy(true);
    await fn();
  } catch (err) {
    deps.setError(resolveErrorMessage(err));
    throw err;
  } finally {
    deps.setBusy(false);
  }
}
