/**
 * ontologyTypes — 本体服务共享类型
 *
 * 从 ontologyService 拆出的类型定义，供 ontologyService 与 ontologyExtractionOps
 * 复用，避免类型与实现互相 import 产生循环依赖。纯类型，无运行时逻辑。
 */
import type { ProjectKnowledgeBase } from '../../../domain/workspace/projectTypes';

export type DomainKnowledgeEntry = {
  term: string;
  definition: string;
  mappedPages: string[];
  mappedApis: string[];
  mappedEntities: string[];
  mappedCodePaths: string[];
  evidence: string;
};

export type TraceabilityPage = { name: string; path: string; components: string[] };
export type TraceabilityApi = { path: string; method: string; description: string };
export type TraceabilityEntity = { name: string; fields: string[] };

export type TraceabilityMap = {
  pages: TraceabilityPage[];
  apis: TraceabilityApi[];
  entities: TraceabilityEntity[];
} | null;

export type BoundaryInput = {
  codePaths: string[];
  requirementRefs: string[];
  riskAreas?: Array<{ risk: string; mitigation: string; trigger: string }>;
} | null;

export type AnalysisReportInput = {
  businessConfirmation?: {
    necessityAssessment?: {
      mustDo?: string[];
      shouldDo?: string[];
      canDefer?: string[];
      outOfScope?: string[];
      rationale?: string;
    };
  };
  domainKnowledge?: {
    rules?: string[];
    unknowns?: string[];
  };
  versionDiffDetailed?: {
    summary?: string;
    impactScope?: string[];
    riskPoints?: string[];
    added?: Array<{ dimension: string; item: string; impact: string; risk: string }>;
    changed?: Array<{ dimension: string; item: string; impact: string; risk: string }>;
    removed?: Array<{ dimension: string; item: string; impact: string; risk: string }>;
  };
  risks?: string[];
  releaseReview?: {
    rollback?: {
      shouldRollback?: boolean;
      reason?: string;
      trigger?: string;
      actions?: string[];
    };
  };
} | null;

export type OntologyInput = {
  domainKnowledgeEntries: DomainKnowledgeEntry[];
  traceabilityMap: TraceabilityMap;
  boundary: BoundaryInput;
  analysisReport: AnalysisReportInput;
};

export type OntologyUpdateResult = {
  updatedKb: ProjectKnowledgeBase;
  newTerms: string[];
  updatedTerms: string[];
  newRules: string[];
  newComponents: string[];
};

export type TermCollision = {
  newTerm: string;
  newDefinition: string;
  existingRule: string;
};

export type CollisionResult = {
  knowledgeHits: string[];
  knowledgeConflicts: string[];
  termCollisions: TermCollision[];
};
