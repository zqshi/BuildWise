import type { Iteration } from '../../../domain/workspace/types';
import type { FullCycleCheckpoint, FullCycleStepId } from '../../../domain/workspace/iterationTypes';

// ── Step labels for user-facing messages ──

export const STEP_LABELS: Record<FullCycleStepId, string> = {
  "analysis": "材料分析",
  "confirmation": "分析确认",
  "ux-guidance": "UX 执行指引",
  "frontend-rewrite": "前端改写",
  "backend-rewrite": "后端改写",
  "merge-rewrite": "改写合并",
  "test-artifacts": "测试产物",
  "release-review": "发布评审",
  "delivery-package": "交付包生成",
  "publish": "发布"
};

// ── Step execution order ──

export const STEP_ORDER: FullCycleStepId[] = [
  "analysis",
  "confirmation",
  "ux-guidance",
  "frontend-rewrite",
  "backend-rewrite",
  "merge-rewrite",
  "test-artifacts",
  "release-review",
  "delivery-package",
  "publish"
];

/** fullCycle 步骤 → 对应 artifact id 映射（基于 defaultArtifactWorkflow item source + step 产出）。
 *  空数组：该步无直接 artifact（confirmation 由 coreOps 写 analysis-report；merge-rewrite/publish 无直接制品）。 */
export const STEP_ARTIFACT_MAP: Record<FullCycleStepId, string[]> = {
  "analysis": ["analysis-report"],
  "confirmation": [],
  "ux-guidance": ["design-spec"],
  "frontend-rewrite": ["frontend-code"],
  "backend-rewrite": ["backend-code"],
  "merge-rewrite": [],
  "test-artifacts": ["test-matrix"],
  "release-review": ["release-review"],
  "delivery-package": ["delivery-package"],
  "publish": []
};

// ── Preconditions for each step ──

export type StepPrecondition = {
  check: (iteration: Iteration, checkpoint: FullCycleCheckpoint) => boolean;
  description: string;
};

export const STEP_PRECONDITIONS: Record<FullCycleStepId, StepPrecondition[]> = {
  "analysis": [
    // analysis 需要有上传材料或继承基线；如果调用方指定 runAnalysis=false 则跳过，不在此处检查
  ],
  "confirmation": [
    {
      check: (it) => !!it.changeControl?.lastAnalysisAt,
      description: "分析尚未完成"
    }
  ],
  "ux-guidance": [
    {
      check: (it) => !!it.changeControl?.confirmedAt,
      description: "分析尚未确认"
    },
    {
      check: (it) => {
        // 检查分析中是否已提取出领域知识（本体非空才能生成有意义的 UX 指引）
        const entries = it.changeControl?.domainKnowledgeEntries;
        return Array.isArray(entries) && entries.length > 0;
      },
      description: "本体中无领域知识条目，无法生成有意义的 UX 指引"
    }
  ],
  "frontend-rewrite": [
    {
      check: (it) => !!it.changeControl?.confirmedAt,
      description: "分析尚未确认"
    },
    {
      check: (it) => !!(it.changeControl?.boundary?.requirementRefs?.length),
      description: "边界尚未锁定"
    },
    {
      check: (it) => !!(it.changeControl?.boundary?.codePaths?.length),
      description: "边界中无代码路径"
    }
  ],
  "backend-rewrite": [
    {
      check: (it) => !!it.changeControl?.confirmedAt,
      description: "分析尚未确认"
    },
    {
      check: (it) => !!(it.changeControl?.boundary?.requirementRefs?.length),
      description: "边界尚未锁定"
    },
    {
      check: (it) => !!(it.changeControl?.boundary?.codePaths?.length),
      description: "边界中无代码路径"
    }
  ],
  "merge-rewrite": [
    {
      check: (_it, cp) => {
        return cp.steps["frontend-rewrite"].status === "completed"
            || cp.steps["backend-rewrite"].status === "completed";
      },
      description: "前端和后端改写均未完成"
    }
  ],
  "test-artifacts": [
    {
      check: (it) => !!it.changeControl?.confirmedAt,
      description: "分析尚未确认"
    },
    {
      check: (it) => {
        const ts = it.changeControl?.traceabilitySnapshot;
        if (!ts) return false;
        const coverage = ts.requirementCoverage ?? 0;
        return coverage > 0;
      },
      description: "需求追溯覆盖率为 0，无法生成有效测试产物"
    }
  ],
  "release-review": [
    {
      check: (it) => !!it.changeControl?.lastAnalysisAt,
      description: "分析尚未完成"
    },
    {
      check: (it) => {
        const matrix = it.changeControl?.generatedTestMatrix;
        if (!Array.isArray(matrix) || matrix.length === 0) return true; // 无测试矩阵时不阻断
        return matrix.some((tc) => tc.executionStatus === "passed");
      },
      description: "测试矩阵中无通过用例，发布评审缺少质量证据"
    }
  ],
  "delivery-package": [
    {
      check: (_it, cp) => cp.steps["release-review"].status === "completed",
      description: "发布评审尚未完成"
    },
    {
      check: (it) => it.changeControl?.lastReleaseReviewDecision !== "block",
      description: "发布评审结论为阻塞，不允许生成交付包"
    }
  ],
  "publish": [
    {
      check: (_it, cp) => cp.steps["delivery-package"].status === "completed",
      description: "交付包尚未生成"
    }
  ]
};
