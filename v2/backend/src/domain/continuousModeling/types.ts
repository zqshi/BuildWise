export type SnapshotStatus = "candidate" | "published" | "superseded";

export type OntologyTerm = {
  canonicalTerm: string;
  aliases: string[];
  technicalAliases: string[];
  definition: string;
  evidence: string[];
};

export type BusinessEntity = {
  id: string;
  name: string;
  businessName: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
};

export type BusinessRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: "one_to_one" | "one_to_many" | "many_to_many";
  businessMeaning: string;
};

export type BusinessRule = {
  id: string;
  name: string;
  statement: string;
  linkedEntityIds: string[];
  linkedSurfaceIds: string[];
  linkedApiIds: string[];
};

export type ReviewTask = {
  id: string;
  type: "term_confirmation" | "entity_confirmation" | "rule_confirmation" | "conflict_resolution";
  title: string;
  description: string;
  blocking: boolean;
};

export type ModelSnapshot = {
  id: string;
  projectId: number;
  iterationId: number | null;
  version: string;
  status: SnapshotStatus;
  ontologyTerms: OntologyTerm[];
  entities: BusinessEntity[];
  relations: BusinessRelation[];
  rules: BusinessRule[];
  reviewTasks: ReviewTask[];
  derivedFromSnapshotId: string | null;
  createdAt: string;
};

export type IterationModelingInput = {
  projectId: number;
  iterationId: number;
  baselineSnapshot: ModelSnapshot | null;
  businessInputs: string[];
  ontologyTerms: OntologyTerm[];
  entities: BusinessEntity[];
  relations: BusinessRelation[];
  rules: BusinessRule[];
};

export type IterationModelingPlan = {
  candidateSnapshot: ModelSnapshot;
  summary: string;
  changedTerms: string[];
  changedEntities: string[];
  changedRules: string[];
  blockingReviewTasks: ReviewTask[];
};

export type ProjectModelView = {
  projectId: number;
  projectName: string;
  projectDescription: string;
  iterationId: number | null;
  iterationName: string;
  iterationStatus: string;
  latestSnapshotId: string | null;
  latestSnapshotStatus: SnapshotStatus | "none";
  ontologyTerms: Array<{
    businessTerm: string;
    aliases: string[];
    technicalAliases: string[];
    definition: string;
    source: "project_knowledge" | "snapshot";
  }>;
  rules: Array<{
    id: string;
    name: string;
    statement: string;
    source: "project_knowledge" | "snapshot";
    linkedEntityIds: string[];
    linkedSurfaceIds: string[];
    linkedApiIds: string[];
  }>;
  entities: Array<{
    id: string;
    name: string;
    businessName: string;
    fields: Array<{
      name: string;
      type: string;
      required: boolean;
    }>;
  }>;
  relations: Array<{
    id: string;
    fromEntityId: string;
    toEntityId: string;
    type: BusinessRelation["type"];
    businessMeaning: string;
  }>;
  reviewTasks: ReviewTask[];
  evidence: string[];
};
