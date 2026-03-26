/**
 * Application-layer logger facade.
 *
 * Re-exports createLogger from infrastructure so that application-layer modules
 * import from within their own layer boundary. The underlying implementation
 * lives in infrastructure/runtime/logger.ts.
 */
export { createLogger } from "../../infrastructure/runtime/logger";
export type { Logger, LogLevel } from "../../domain/shared/logger";
