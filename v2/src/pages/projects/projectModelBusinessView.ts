import type { ProjectModelViewPayload } from "../../domain/workspace/modelOpsTypes";
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
    view.ontologyTerms.find((item) => item.aliases.includes(businessName) || item.aliases.includes(entityName))
  );
}

export function buildModelEntityCards(view: ProjectModelViewPayload | null): ModelEntityCard[] {
  if (!view) {
    return [];
  }
  return view.entities.map((entity) => {
    const term = findOntologyTerm(view, entity.name, entity.businessName);
    const relationCount = view.relations.filter((item) => item.fromEntityId === entity.id || item.toEntityId === entity.id).length;
    const ruleCount = view.rules.filter((item) => item.linkedEntityIds.includes(entity.id)).length;
    return {
      id: entity.id,
      title: entity.businessName || toFriendlyName(entity.id),
      technicalName: entity.name,
      definition: term?.definition || "暂无业务定义，请在项目知识中补充术语或规则说明。",
      aliases: term?.aliases || [],
      technicalAliases: term?.technicalAliases || [],
      fieldPreview: entity.fields.slice(0, 6).map((field) => `${field.name}:${field.type}${field.required ? " *" : ""}`),
      relationCount,
      ruleCount
    };
  });
}

export function buildModelRuleMappings(view: ProjectModelViewPayload | null): ModelRuleMapping[] {
  if (!view) {
    return [];
  }
  const entityNameById = new Map(view.entities.map((entity) => [entity.id, entity.businessName || entity.name]));
  return view.rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    statement: normalizeInlineMarkdownText(rule.statement || rule.name),
    source: rule.source,
    linkedEntities: rule.linkedEntityIds.map((item) => entityNameById.get(item) || toFriendlyName(item)),
    linkedSurfaces: rule.linkedSurfaceIds,
    linkedApis: rule.linkedApiIds
  }));
}

export function buildModelRelationNarratives(view: ProjectModelViewPayload | null) {
  if (!view) {
    return [];
  }
  const entityNameById = new Map(view.entities.map((entity) => [entity.id, entity.businessName || entity.name]));
  return view.relations.map((relation) => ({
    id: relation.id,
    title: `${entityNameById.get(relation.fromEntityId) || toFriendlyName(relation.fromEntityId)} ${toFriendlyRelationType(relation.type)} ${entityNameById.get(relation.toEntityId) || toFriendlyName(relation.toEntityId)}`,
    meaning: normalizeInlineMarkdownText(relation.businessMeaning || "暂无业务关系说明")
  }));
}
