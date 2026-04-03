export type ModelRelationPayload = {
  id: string;
  projectId?: number;
  fromEntityId: string;
  toEntityId: string;
  type: "one_to_one" | "one_to_many" | "many_to_many";
  name?: string;
  businessDescription?: string;
  ontologyBasis?: string;
  dataBasis?: string[];
};

export type ProjectModelBusinessSummaryPayload = {
  generatedAt: string;
  source: "llm" | "derived";
  model: string;
  projectId: number;
  iterationId: number | null;
  summary: string;
  focus: string[];
  risks: string[];
};

export type ProjectModelViewPayload = {
  projectName?: string;
  iterationName?: string;
  iterationStatus?: string;
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
    type: "one_to_one" | "one_to_many" | "many_to_many";
    businessMeaning?: string;
  }>;
  rules: Array<{
    id: string;
    name: string;
    statement?: string;
    source: "project_knowledge" | "snapshot";
    linkedEntityIds: string[];
    linkedSurfaceIds: string[];
    linkedApiIds: string[];
  }>;
  reviewTasks: Array<{ title: string; blocking: boolean }>;
  ontologyTerms: Array<{
    businessTerm: string;
    aliases: string[];
    technicalAliases: string[];
    definition: string;
    source: "project_knowledge" | "snapshot";
  }>;
  evidence: string[];
  latestSnapshotId: string | null;
  latestSnapshotStatus: "none" | "candidate" | "published" | "superseded";
};
