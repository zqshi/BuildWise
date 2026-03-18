import type { FastifyReply, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "./runtimeConfig";
import type { LlmRuntimeStatus } from "../../application/workspace/agentRunner";
import type { RuntimeDependencyStatus } from "./runtimeDependencyProbe";

type RateBucket = {
  windowStart: number;
  count: number;
};

export type RuntimeSnapshot = {
  startedAt: string;
  uptimeSec: number;
  shuttingDown: boolean;
  llmRequired: boolean;
  dependencyRequired: boolean;
  llm: LlmRuntimeStatus;
  dependencies: RuntimeDependencyStatus;
  requests: {
    inFlight: number;
    total: number;
    errors: number;
    rateLimited: number;
    avgLatencyMs: number;
  };
};

export class RuntimeState {
  private readonly startedAtMs = Date.now();
  private readonly startedAtIso = new Date(this.startedAtMs).toISOString();
  private readonly rateByKey = new Map<string, RateBucket>();
  private shuttingDown = false;
  private inFlight = 0;
  private total = 0;
  private errors = 0;
  private rateLimited = 0;
  private latencyMsTotal = 0;
  private llmStatus: LlmRuntimeStatus = {
    configured: false,
    reachable: false,
    baseUrl: "",
    model: "gpt-4o-mini",
    checkedAt: "",
    error: "not_checked"
  };
  private dependencyStatus: RuntimeDependencyStatus = {
    modelFile: {
      required: false,
      healthy: true,
      checkedAt: "",
      detail: "not_checked"
    },
    storage: {
      required: false,
      healthy: true,
      checkedAt: "",
      detail: "not_checked"
    }
  };

  private config: RuntimeConfig;
  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  onRequest(request: FastifyRequest, reply: FastifyReply) {
    this.inFlight += 1;
    this.total += 1;

    if (this.shuttingDown) {
      reply.code(503).header("connection", "close");
      throw new Error("service is shutting down");
    }

    const now = Date.now();
    const key = request.ip || "unknown";
    const bucket = this.rateByKey.get(key);
    if (!bucket || now - bucket.windowStart >= this.config.rateLimitWindowMs) {
      this.rateByKey.set(key, { windowStart: now, count: 1 });
      this.compactRateBuckets(now);
      return;
    }

    bucket.count += 1;
    if (bucket.count > this.config.rateLimitMax) {
      this.rateLimited += 1;
      const retryAfter = Math.ceil((this.config.rateLimitWindowMs - (now - bucket.windowStart)) / 1000);
      reply.code(429).header("retry-after", String(Math.max(1, retryAfter)));
      throw new Error("too many requests");
    }
  }

  onResponse(request: FastifyRequest, reply: FastifyReply) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const latency = Number(reply.elapsedTime || 0);
    this.latencyMsTotal += latency;
    if (reply.statusCode >= 500) {
      this.errors += 1;
    }
    reply.header("x-request-id", request.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-permitted-cross-domain-policies", "none");
    reply.header("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    reply.header("strict-transport-security", "max-age=63072000; includeSubDomains");
  }

  setShuttingDown(value: boolean) {
    this.shuttingDown = value;
  }

  isReady() {
    if (this.shuttingDown) {
      return false;
    }
    if (this.config.dependencyRequired) {
      if (!this.dependencyStatus.modelFile.healthy || !this.dependencyStatus.storage.healthy) {
        return false;
      }
    }
    if (this.config.llmRequired) {
      return this.llmStatus.reachable;
    }
    return true;
  }

  setLlmStatus(status: LlmRuntimeStatus) {
    this.llmStatus = status;
  }

  setDependencyStatus(status: RuntimeDependencyStatus) {
    this.dependencyStatus = status;
  }

  snapshot(): RuntimeSnapshot {
    const uptimeSec = Math.floor((Date.now() - this.startedAtMs) / 1000);
    return {
      startedAt: this.startedAtIso,
      uptimeSec,
      shuttingDown: this.shuttingDown,
      llmRequired: this.config.llmRequired,
      dependencyRequired: this.config.dependencyRequired,
      llm: this.llmStatus,
      dependencies: this.dependencyStatus,
      requests: {
        inFlight: this.inFlight,
        total: this.total,
        errors: this.errors,
        rateLimited: this.rateLimited,
        avgLatencyMs: this.total > 0 ? Math.round((this.latencyMsTotal / this.total) * 100) / 100 : 0
      }
    };
  }

  private compactRateBuckets(now: number) {
    if (this.rateByKey.size < 500) {
      return;
    }
    for (const [key, bucket] of this.rateByKey) {
      if (now - bucket.windowStart > this.config.rateLimitWindowMs * 2) {
        this.rateByKey.delete(key);
      }
    }
  }
}
