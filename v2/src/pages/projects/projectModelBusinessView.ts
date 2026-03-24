import type { ProjectModelViewPayload } from "../../domain/workspace/modelOpsTypes.ts";
import { normalizeProjectModelViewPayload } from "../../app/projectModelViewNormalization.ts";
import { normalizeInlineMarkdownText, toFriendlyName, toFriendlyRelationType } from "./projectOverviewPanelHelpers.ts";

export type ModelEntityCard = {
  id: string;
  title: string;
  technicalName: string;
  definition: string;
  aliases: string[];
  technicalAliases: string[];
  fieldPreview: string[];
  relationCount: number;
  ruleCount: number;
};

export type ModelRuleMapping = {
  id: string;
  name: string;
  statement: string;
  source: "project_knowledge" | "snapshot";
  linkedEntities: string[];
  linkedSurfaces: string[];
  linkedApis: string[];
};

function findOntologyTerm(view: ProjectModelViewPayload, entityName: string, businessName: string) {
  return (
    view.ontologyTerms.find((item) => item.businessTerm === businessName) ||
    view.ontologyTerms.find((item) => item.businessTerm === entityName) ||
    view.ontologyTerms.find((item) => (item.aliases || []).includes(businessName) || (item.aliases || []).includes(entityName))
  );
}

function buildFallbackEntityDefinition(view: ProjectModelViewPayload, entity: ProjectModelViewPayload["entities"][number]) {
  const linkedRules = view.rules
    .filter((item) => item.linkedEntityIds.includes(entity.id))
    .map((item) => normalizeInlineMarkdownText(item.statement || item.name))
    .filter(Boolean);
  if (linkedRules.length > 0) {
    return `${entity.businessName || entity.name}主要受这些业务约束驱动：${linkedRules.slice(0, 2).join("；")}。`;
  }

  const relatedRelations = view.relations.filter((item) => item.fromEntityId === entity.id || item.toEntityId === entity.id);
  if (relatedRelations.length > 0) {
    const relatedEntityIds = relatedRelations.map((item) => (item.fromEntityId === entity.id ? item.toEntityId : item.fromEntityId));
    const relatedEntityNames = Array.from(
      new Set(
        relatedEntityIds.map((item) => {
          const relatedEntity = view.entities.find((candidate) => candidate.id === item);
          return relatedEntity?.businessName || relatedEntity?.name || toFriendlyName(item);
        })
      )
    );
    return `${entity.businessName || entity.name}在当前业务模型中与${relatedEntityNames.slice(0, 3).join("、")}形成关键关系，用于支撑核心流程。`;
  }

  if (entity.fields.length > 0) {
    return `${entity.businessName || entity.name}是当前项目中的核心业务实体，当前已沉淀 ${entity.fields.length} 个关键属性。`;
  }

  return `${entity.businessName || entity.name}是当前项目中已识别的业务实体，建议后续补充术语定义和约束说明。`;
}

export function buildModelEntityCards(view: ProjectModelViewPayload | null): ModelEntityCard[] {
  if (!view) {
    return [];
  }
  const normalizedView = normalizeProjectModelViewPayload(view);
  return normalizedView.entities.map((entity) => {
    const term = findOntologyTerm(normalizedView, entity.name, entity.businessName);
    const relationCount = normalizedView.relations.filter((item) => item.fromEntityId === entity.id || item.toEntityId === entity.id).length;
    const ruleCount = normalizedView.rules.filter((item) => item.linkedEntityIds.includes(entity.id)).length;
    return {
      id: entity.id,
      title: entity.businessName || toFriendlyName(entity.id),
      technicalName: entity.name,
      definition: term?.definition || buildFallbackEntityDefinition(normalizedView, entity),
      aliases: term?.aliases || [],
      technicalAliases: term?.technicalAliases || [],
      fieldPreview: (entity.fields || []).slice(0, 6).map((field) => `${field.name}:${field.type}${field.required ? " *" : ""}`),
      relationCount,
      ruleCount
    };
  });
}

export function buildModelRuleMappings(view: ProjectModelViewPayload | null): ModelRuleMapping[] {
  if (!view) {
    return [];
  }
  const normalizedView = normalizeProjectModelViewPayload(view);
  const entityNameById = new Map(normalizedView.entities.map((entity) => [entity.id, entity.businessName || entity.name]));
  return normalizedView.rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    statement: normalizeInlineMarkdownText(rule.statement || rule.name),
    source: rule.source,
    linkedEntities: (rule.linkedEntityIds || []).map((item) => entityNameById.get(item) || toFriendlyName(item)),
    linkedSurfaces: rule.linkedSurfaceIds || [],
    linkedApis: rule.linkedApiIds || []
  }));
}

export function buildModelRelationNarratives(view: ProjectModelViewPayload | null) {
  if (!view) {
    return [];
  }
  const normalizedView = normalizeProjectModelViewPayload(view);
  const entityNameById = new Map(normalizedView.entities.map((entity) => [entity.id, entity.businessName || entity.name]));
  return normalizedView.relations.map((relation) => ({
    id: relation.id,
    title: `${entityNameById.get(relation.fromEntityId) || toFriendlyName(relation.fromEntityId)} ${toFriendlyRelationType(relation.type)} ${entityNameById.get(relation.toEntityId) || toFriendlyName(relation.toEntityId)}`,
    meaning: normalizeInlineMarkdownText(relation.businessMeaning || "暂无业务关系说明")
  }));
}
