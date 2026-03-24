import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function findMetric(metrics, name) {
  return Array.isArray(metrics) ? metrics.find((item) => item?.name === name)?.value : undefined;
}

export async function collectAlertBaseline({ getJson, thresholds }) {
  const [status, ready, opsMetrics] = await Promise.all([
    getJson("/api/v1/status"),
    getJson("/ready"),
    getJson("/api/v1/ops/metrics")
  ]);
  const alerts = [];
  if ((status?.status || "").toLowerCase() !== "ok") {
    alerts.push(`status_not_ok:${status?.status || "unknown"}`);
  }
  if ((ready?.status || "").toLowerCase() !== "ready") {
    alerts.push(`service_not_ready:${ready?.status || "unknown"}`);
  }

  const runtime = status?.runtime || {};
  const inFlight = Number(runtime?.requests?.inFlight || 0);
  const avgLatencyMs = Number(runtime?.requests?.avgLatencyMs || 0);
  const rateLimited = Number(runtime?.requests?.rateLimited || 0);
  const deploymentSuccessRate = Number(findMetric(opsMetrics?.metrics, "deployment_success_rate") || 0);
  if (inFlight > thresholds.maxInflight) {
    alerts.push(`inflight_high:${inFlight}>${thresholds.maxInflight}`);
  }
  if (avgLatencyMs > thresholds.maxAvgLatencyMs) {
    alerts.push(`latency_high:${avgLatencyMs}>${thresholds.maxAvgLatencyMs}`);
  }
  if (rateLimited > thresholds.maxRateLimited) {
    alerts.push(`rate_limited_high:${rateLimited}>${thresholds.maxRateLimited}`);
  }
  if (deploymentSuccessRate < thresholds.minDeploymentSuccessRate) {
    alerts.push(`deploy_success_rate_low:${deploymentSuccessRate}<${thresholds.minDeploymentSuccessRate}`);
  }

  return {
    checkedAt: new Date().toISOString(),
    thresholds,
    snapshot: {
      serviceStatus: status?.status || "unknown",
      readiness: ready?.status || "unknown",
      inFlight,
      avgLatencyMs,
      rateLimited,
      deploymentSuccessRate
    },
    alerts
  };
}

export async function collectLlmBaseline({ getJson, policy }) {
  const [status, ready] = await Promise.all([getJson("/api/v1/status"), getJson("/ready")]);
  const llm = status?.runtime?.llm || {};
  const llmRequired = Boolean(status?.runtime?.llmRequired);
  const alerts = [];
  if ((status?.status || "").toLowerCase() !== "ok") {
    alerts.push(`status_not_ok:${status?.status || "unknown"}`);
  }
  if (policy.requireConfigured && !llm.configured) {
    alerts.push(`llm_not_configured:${llm.error || "missing_configuration"}`);
  }
  if ((policy.requireReachable || llmRequired) && !llm.reachable) {
    alerts.push(`llm_not_reachable:${llm.error || "probe_failed"}`);
  }
  if ((ready?.status || "").toLowerCase() !== "ready") {
    alerts.push(`service_not_ready:${ready?.reason || ready?.status || "unknown"}`);
  }
  return {
    checkedAt: new Date().toISOString(),
    policy,
    snapshot: {
      status: status?.status || "unknown",
      ready: ready?.status || "unknown",
      readyReason: ready?.reason || "",
      llmRequired,
      llm: {
        configured: Boolean(llm.configured),
        reachable: Boolean(llm.reachable),
        baseUrl: llm.baseUrl || "",
        model: llm.model || "",
        checkedAt: llm.checkedAt || "",
        error: llm.error || ""
      }
    },
    alerts
  };
}

export async function collectPreflightBaseline({ getJson, llmPolicy, alertThresholds }) {
  const [status, ready, opsMetrics] = await Promise.all([
    getJson("/api/v1/status"),
    getJson("/ready"),
    getJson("/api/v1/ops/metrics")
  ]);

  const llm = status?.runtime?.llm || {};
  const llmRequired = Boolean(status?.runtime?.llmRequired);
  const dependencyRequired = Boolean(status?.runtime?.dependencyRequired);
  const dependencies = status?.runtime?.dependencies || {};
  const alerts = [];

  if ((status?.status || "").toLowerCase() !== "ok") {
    alerts.push(`status_not_ok:${status?.status || "unknown"}`);
  }
  if ((ready?.status || "").toLowerCase() !== "ready") {
    alerts.push(`service_not_ready:${ready?.reason || ready?.status || "unknown"}`);
  }
  if (llmPolicy.requireConfigured && !llm.configured) {
    alerts.push(`llm_not_configured:${llm.error || "missing_configuration"}`);
  }
  if ((llmPolicy.requireReachable || llmRequired) && !llm.reachable) {
    alerts.push(`llm_not_reachable:${llm.error || "probe_failed"}`);
  }
  if (dependencyRequired) {
    if (dependencies?.modelFile && !dependencies.modelFile.healthy) {
      alerts.push(`model_file_unhealthy:${dependencies?.modelFile?.detail || "unknown"}`);
    }
    if (!dependencies?.storage?.healthy) {
      alerts.push(`storage_unhealthy:${dependencies?.storage?.detail || "unknown"}`);
    }
  }

  const runtime = status?.runtime || {};
  const inFlight = Number(runtime?.requests?.inFlight || 0);
  const avgLatencyMs = Number(runtime?.requests?.avgLatencyMs || 0);
  const rateLimited = Number(runtime?.requests?.rateLimited || 0);
  const deploymentSuccessRate = Number(findMetric(opsMetrics?.metrics, "deployment_success_rate") || 0);
  const testMatrixCoverage = Number(findMetric(opsMetrics?.metrics, "iteration_test_matrix_coverage") || 100);
  const testMatrixExecutionCoverage = Number(findMetric(opsMetrics?.metrics, "iteration_test_matrix_execution_coverage") || 100);
  const testMatrixPassRate = Number(findMetric(opsMetrics?.metrics, "iteration_test_matrix_pass_rate") || 100);
  const highValueFindingsCoverage = Number(findMetric(opsMetrics?.metrics, "iteration_high_value_findings_coverage") || 100);
  const p0FindingsTotal = Number(findMetric(opsMetrics?.metrics, "iteration_p0_findings_total") || 0);
  const ignoredFilesRatio = Number(findMetric(opsMetrics?.metrics, "iteration_analysis_ignored_files_ratio") || 0);

  if (inFlight > alertThresholds.maxInflight) {
    alerts.push(`inflight_high:${inFlight}>${alertThresholds.maxInflight}`);
  }
  if (avgLatencyMs > alertThresholds.maxAvgLatencyMs) {
    alerts.push(`latency_high:${avgLatencyMs}>${alertThresholds.maxAvgLatencyMs}`);
  }
  if (rateLimited > alertThresholds.maxRateLimited) {
    alerts.push(`rate_limited_high:${rateLimited}>${alertThresholds.maxRateLimited}`);
  }
  if (deploymentSuccessRate < alertThresholds.minDeploymentSuccessRate) {
    alerts.push(`deploy_success_rate_low:${deploymentSuccessRate}<${alertThresholds.minDeploymentSuccessRate}`);
  }
  if (testMatrixCoverage < alertThresholds.minTestMatrixCoverage) {
    alerts.push(`test_matrix_coverage_low:${testMatrixCoverage}<${alertThresholds.minTestMatrixCoverage}`);
  }
  if (testMatrixExecutionCoverage < alertThresholds.minTestMatrixExecutionCoverage) {
    alerts.push(`test_matrix_execution_coverage_low:${testMatrixExecutionCoverage}<${alertThresholds.minTestMatrixExecutionCoverage}`);
  }
  if (testMatrixPassRate < alertThresholds.minTestMatrixPassRate) {
    alerts.push(`test_matrix_pass_rate_low:${testMatrixPassRate}<${alertThresholds.minTestMatrixPassRate}`);
  }
  if (highValueFindingsCoverage < alertThresholds.minHighValueFindingsCoverage) {
    alerts.push(`high_value_findings_coverage_low:${highValueFindingsCoverage}<${alertThresholds.minHighValueFindingsCoverage}`);
  }
  if (p0FindingsTotal > alertThresholds.maxP0FindingsTotal) {
    alerts.push(`p0_findings_total_high:${p0FindingsTotal}>${alertThresholds.maxP0FindingsTotal}`);
  }
  if (ignoredFilesRatio > alertThresholds.maxIgnoredFilesRatio) {
    alerts.push(`ignored_files_ratio_high:${ignoredFilesRatio}>${alertThresholds.maxIgnoredFilesRatio}`);
  }

  return {
    checkedAt: new Date().toISOString(),
    policies: { llmPolicy, alertThresholds },
    snapshot: {
      status: status?.status || "unknown",
      ready: ready?.status || "unknown",
      readyReason: ready?.reason || "",
      llmRequired,
      dependencyRequired,
      llm: {
        configured: Boolean(llm.configured),
        reachable: Boolean(llm.reachable),
        baseUrl: llm.baseUrl || "",
        model: llm.model || "",
        checkedAt: llm.checkedAt || "",
        error: llm.error || ""
      },
      dependencies: {
        modelFile: {
          healthy: dependencies?.modelFile ? Boolean(dependencies.modelFile.healthy) : true,
          detail: dependencies?.modelFile?.detail || ""
        },
        storage: {
          healthy: Boolean(dependencies?.storage?.healthy),
          detail: dependencies?.storage?.detail || ""
        }
      },
      runtime: {
        inFlight,
        avgLatencyMs,
        rateLimited,
        deploymentSuccessRate,
        testMatrixCoverage,
        testMatrixExecutionCoverage,
        testMatrixPassRate,
        highValueFindingsCoverage,
        p0FindingsTotal,
        ignoredFilesRatio
      }
    },
    alerts
  };
}

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function resolveWorkspaceDataFile(env) {
  if (env.WORKSPACE_DATA_FILE) {
    return resolve(env.WORKSPACE_DATA_FILE);
  }
  const defaults = ["./data.runtime.json", "./data.json"].map((value) => resolve(value));
  return firstExistingPath(defaults) || defaults[0];
}

function resolveWorkspaceDbFile(env, workspaceDataFile) {
  if (env.WORKSPACE_DB_FILE) {
    return resolve(env.WORKSPACE_DB_FILE);
  }
  const derivedDb = workspaceDataFile.replace(/\.json$/i, ".db");
  const defaults = ["./workspace.db", derivedDb, "./data.db"].map((value) => resolve(value));
  return firstExistingPath(defaults) || defaults[0];
}

function nowToken() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function runBackupRestoreDrill(env = process.env) {
  const storageBackend = env.STORAGE_BACKEND || "json";
  const backupRoot = resolve(env.BACKUP_ROOT || "./backups");
  const workspaceDataFile = resolveWorkspaceDataFile(env);
  const workspaceDbFile = resolveWorkspaceDbFile(env, workspaceDataFile);
  const targetDir = resolve(backupRoot, `drill-${nowToken()}`);
  ensureDir(targetDir);

  const result =
    storageBackend === "sqlite"
      ? (() => {
          if (!existsSync(workspaceDbFile)) {
            throw new Error(`workspace db file not found: ${workspaceDbFile}`);
          }
          const backupDb = resolve(targetDir, basename(workspaceDbFile));
          copyFileSync(workspaceDbFile, backupDb);
          for (const suffix of ["-wal", "-shm"]) {
            const src = `${workspaceDbFile}${suffix}`;
            if (existsSync(src)) {
              copyFileSync(src, `${backupDb}${suffix}`);
            }
          }
          const restoreDb = resolve(targetDir, "restore-check.db");
          copyFileSync(backupDb, restoreDb);
          const db = new DatabaseSync(restoreDb);
          const row = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='workspace_collections'").get();
          const hasCollections = Number(row?.count || 0) > 0;
          const projectsRow = hasCollections ? db.prepare("SELECT COUNT(*) AS count FROM projects").get() : { count: 0 };
          const projectCount = Number(projectsRow?.count || 0);
          db.close();
          return {
            backupFile: backupDb,
            restoredPath: restoreDb,
            hasCollections,
            projectCount,
            fileSizeBytes: statSync(backupDb).size
          };
        })()
      : (() => {
          if (!existsSync(workspaceDataFile)) {
            throw new Error(`workspace data file not found: ${workspaceDataFile}`);
          }
          const backupFile = resolve(targetDir, basename(workspaceDataFile));
          copyFileSync(workspaceDataFile, backupFile);
          const restoredPath = resolve(targetDir, "restore-check.json");
          copyFileSync(backupFile, restoredPath);
          const parsed = JSON.parse(readFileSync(restoredPath, "utf-8"));
          return {
            backupFile,
            restoredPath,
            projectCount: Array.isArray(parsed?.projects) ? parsed.projects.length : 0,
            iterationCount: Array.isArray(parsed?.iterations) ? parsed.iterations.length : 0,
            fileSizeBytes: statSync(backupFile).size
          };
        })();

  const report = {
    drilledAt: new Date().toISOString(),
    backend: storageBackend === "sqlite" ? "sqlite" : "json",
    source: storageBackend === "sqlite" ? workspaceDbFile : workspaceDataFile,
    backupDir: targetDir,
    result
  };

  if (env.DRILL_CLEANUP === "true") {
    rmSync(targetDir, { recursive: true, force: true });
  }

  return report;
}
