export type ModelField = {
  id: string;
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
};

export type ModelEntity = {
  id: string;
  name: string;
  fields: ModelField[];
  businessLabel?: string;
};

export type ModelRule = {
  id: string;
  name?: string;
  type?: string;
  target?: string;
  message?: string;
};

export type ModelPage = {
  id: string;
  name: string;
  route: string;
  layout?: string;
  components?: unknown[];
};

export type ModelApi = {
  id?: string;
  method?: string;
  path?: string;
};

export type ModelRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: "one_to_one" | "one_to_many" | "many_to_many";
  name?: string;
};

export type ModelStore = {
  entities: ModelEntity[];
  relations: ModelRelation[];
  rules: ModelRule[];
  pages: ModelPage[];
  apis: ModelApi[];
};

export type RuleCompileResult = {
  compiledAt: string;
  ruleCount: number;
  validRules: number;
  invalidRules: number;
  warnings: string[];
};

export type SyncReport = {
  generatedAt: string;
  projectCount: number;
  iterationCount: number;
  modelEntityCount: number;
  modelRuleCount: number;
  modelPageCount: number;
  coverageScore: number;
  summary: string;
  impacts: string[];
  risks: string[];
};

export type RuleBinding = {
  ruleId: string;
  target: string;
  matchedEntities: string[];
  status: "bound" | "unbound";
  reason: string;
};

export type RuleBindingReport = {
  generatedAt: string;
  bindings: RuleBinding[];
};

export type TraceItem = {
  pageRoute: string;
  apiPath: string;
  relation: string;
  modelRef: string;
  codeRef: string;
  intent: string;
};

export type TraceReport = {
  generatedAt: string;
  items: TraceItem[];
};
