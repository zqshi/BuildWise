"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeState = void 0;
class RuntimeState {
    constructor(config) {
        this.config = config;
        this.startedAtMs = Date.now();
        this.startedAtIso = new Date(this.startedAtMs).toISOString();
        this.rateByKey = new Map();
        this.shuttingDown = false;
        this.inFlight = 0;
        this.total = 0;
        this.errors = 0;
        this.rateLimited = 0;
        this.latencyMsTotal = 0;
        this.llmStatus = {
            configured: false,
            reachable: false,
            baseUrl: "",
            model: "gpt-4o-mini",
            checkedAt: "",
            error: "not_checked"
        };
        this.dependencyStatus = {
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
    }
    onRequest(request, reply) {
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
    onResponse(request, reply) {
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
    }
    setShuttingDown(value) {
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
    setLlmStatus(status) {
        this.llmStatus = status;
    }
    setDependencyStatus(status) {
        this.dependencyStatus = status;
    }
    snapshot() {
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
    compactRateBuckets(now) {
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
exports.RuntimeState = RuntimeState;
