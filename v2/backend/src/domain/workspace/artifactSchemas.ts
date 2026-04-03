/**
 * Artifact Schemas — 交付物严格的 JSON Schema 定义
 *
 * 每个 Schema 定义了交付物的预期结构、必填字段和数据类型约束。
 * 用于 LLM 输出验证和重试逻辑。
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type TestCase = {
  caseId: string;
  type: "unit" | "integration" | "e2e" | "acceptance";
  focus: string;
  expected: string;
  evidence: string;
  executionStatus: "pending" | "passed" | "failed" | "blocked" | "skipped";
};

export type TestMatrixArtifact = {
  artifactId: "test-matrix";
  title: "测试矩阵";
  summary: string;
  cases: TestCase[];
  coverageSummary: {
    entities: string[];
    rules: string[];
    apis: string[];
  };
};

export type RequirementItem = {
  id: string;
  description: string;
  priority: "must" | "should" | "could";
  source?: string;
  status: "pending" | "implemented" | "validated" | "rejected";
};

export type BoundaryArtifact = {
  artifactId: "boundary-confirmation";
  title: "边界确认";
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  components: string[];
  codePaths: string[];
};

export type PRDArtifact = {
  artifactId: "product-requirements-doc";
  title: "产品需求文档";
  sections: Array<{
    id: string;
    title: string;
    content: string;
    type: "introduction" | "features" | "non-requirements" | "ui-notes" | "technical-notes";
  }>;
  relatedTerms: string[];
  version: string;
};

export type AnalysisReportArtifact = {
  artifactId: "analysis-report";
  title: "需求分析报告";
  summary: string;
  identifiedTerms: string[];
  identifiedEntities: string[];
  identifiedRules: string[];
  risks: string[];
  businessConfirmation: {
    coreIntent: string;
    necessityAssessment: {
      mustDo: string[];
      shouldDo: string[];
      couldDefer: string[];
      outOfScope: string[];
      rationale?: string;
    };
  };
};

export type ReleaseReviewArtifact = {
  artifactId: "release-review";
  title: "发布评审";
  conclusion: "go" | "caution" | "block";
  blockers: string[];
  checkDimensions: Array<{
    dimension: string;
    status: "pass" | "fail" | "skip";
    notes: string;
  }>;
  rollbackPlan?: {
    shouldRollback: boolean;
    trigger: string;
    actions: string[];
  };
};

export type DeliveryPackageArtifact = {
  artifactId: "delivery-package";
  title: "交付归档";
  version: string;
  summary: string;
  includedArtifacts: string[];
  reviewConclusion: string;
  nextIterationInheritance: {
    carriedGoals: string[];
    carriedRisks: string[];
    carriedDecisions: string[];
  };
};

// ---------------------------------------------------------------------------
// Schema 验证规则
// ---------------------------------------------------------------------------

export const ARTIFACT_SCHEMAS: Record<string, any> = {
  "test-matrix": {
    type: "object",
    required: ["artifactId", "title", "summary", "cases"],
    properties: {
      artifactId: { type: "string", enum: ["test-matrix"] },
      title: { type: "string", minLength: 1 },
      summary: { type: "string", maxLength: 500 },
      cases: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["caseId", "type", "focus", "expected", "evidence"],
          properties: {
            caseId: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
            type: { type: "string", enum: ["unit", "integration", "e2e", "acceptance"] },
            focus: { type: "string", minLength: 1 },
            expected: { type: "string", minLength: 1 },
            evidence: { type: "string" }
          }
        }
      },
      coverageSummary: {
        type: "object",
        required: ["entities", "rules", "apis"],
        properties: {
          entities: { type: "array", items: { type: "string" } },
          rules: { type: "array", items: { type: "string" } },
          apis: { type: "array", items: { type: "string" } }
        }
      }
    }
  },

  "boundary-confirmation": {
    type: "object",
    required: ["artifactId", "title", "inScope", "outOfScope", "acceptanceCriteria"],
    properties: {
      artifactId: { type: "string", enum: ["boundary-confirmation"] },
      title: { type: "string", minLength: 1 },
      inScope: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
      outOfScope: { type: "array", items: { type: "string" } },
      acceptanceCriteria: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
      components: { type: "array", items: { type: "string" } },
      codePaths: { type: "array", items: { type: "string" } }
    }
  },

  "product-requirements-doc": {
    type: "object",
    required: ["artifactId", "title", "sections", "version"],
    properties: {
      artifactId: { type: "string", enum: ["product-requirements-doc"] },
      title: { type: "string", minLength: 1 },
      version: { type: "string", pattern: "^v\\d+\\.\\d+\\.\\d+$" },
      sections: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["id", "title", "content", "type"],
          properties: {
            id: { type: "string" },
            title: { type: "string", minLength: 1 },
            content: { type: "string", minLength: 1 },
            type: { type: "string", enum: ["introduction", "features", "non-requirements", "ui-notes", "technical-notes"] }
          }
        }
      },
      relatedTerms: { type: "array", items: { type: "string" } }
    }
  },

  "analysis-report": {
    type: "object",
    required: ["artifactId", "title", "summary", "businessConfirmation"],
    properties: {
      artifactId: { type: "string", enum: ["analysis-report"] },
      title: { type: "string", minLength: 1 },
      summary: { type: "string", maxLength: 500 },
      identifiedTerms: { type: "array", items: { type: "string" } },
      identifiedEntities: { type: "array", items: { type: "string" } },
      identifiedRules: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      businessConfirmation: {
        type: "object",
        required: ["coreIntent", "necessityAssessment"],
        properties: {
          coreIntent: { type: "string", minLength: 1 },
          necessityAssessment: {
            type: "object",
            required: ["mustDo"],
            properties: {
              mustDo: { type: "array", items: { type: "string", minLength: 1 } },
              shouldDo: { type: "array", items: { type: "string" } },
              couldDefer: { type: "array", items: { type: "string" } },
              outOfScope: { type: "array", items: { type: "string" } },
              rationale: { type: "string" }
            }
          }
        }
      }
    }
  },

  "release-review": {
    type: "object",
    required: ["artifactId", "title", "conclusion", "checkDimensions"],
    properties: {
      artifactId: { type: "string", enum: ["release-review"] },
      title: { type: "string", minLength: 1 },
      conclusion: { type: "string", enum: ["go", "caution", "block"] },
      blockers: { type: "array", items: { type: "string" } },
      checkDimensions: {
        type: "array",
        items: {
          type: "object",
          required: ["dimension", "status", "notes"],
          properties: {
            dimension: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["pass", "fail", "skip"] },
            notes: { type: "string" }
          }
        }
      },
      rollbackPlan: {
        type: "object",
        properties: {
          shouldRollback: { type: "boolean" },
          trigger: { type: "string" },
          actions: { type: "array", items: { type: "string" } }
        }
      }
    }
  },

  "delivery-package": {
    type: "object",
    required: ["artifactId", "title", "version", "summary", "includedArtifacts", "reviewConclusion"],
    properties: {
      artifactId: { type: "string", enum: ["delivery-package"] },
      title: { type: "string", minLength: 1 },
      version: { type: "string", pattern: "^v\\d+\\.\\d+\\.\\d+$" },
      summary: { type: "string", maxLength: 500 },
      includedArtifacts: { type: "array", items: { type: "string" } },
      reviewConclusion: { type: "string" },
      nextIterationInheritance: {
        type: "object",
        properties: {
          carriedGoals: { type: "array", items: { type: "string" } },
          carriedRisks: { type: "array", items: { type: "string" } },
          carriedDecisions: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

// ---------------------------------------------------------------------------
// 导出类型
// ---------------------------------------------------------------------------

export type ArtifactSchema = {
  id: string;
  name: string;
  schema: any;
};

export function getArtifactSchema(artifactId: string): any {
  return ARTIFACT_SCHEMAS[artifactId];
}

export function getAllArtifactSchemas(): ArtifactSchema[] {
  return Object.keys(ARTIFACT_SCHEMAS).map(id => ({
    id,
    name: ARTIFACT_SCHEMAS[id]!.properties.title?.const || id,
    schema: ARTIFACT_SCHEMAS[id]!
  }));
}
