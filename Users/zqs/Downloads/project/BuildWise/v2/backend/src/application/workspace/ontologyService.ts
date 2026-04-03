/**
 * Ontology Service — 本体服务（增强版）
 *
 * 提供：
 * 1. 本体提取和更新
 * 2. 本体 diff 检测（代码变更对本体的影响）
 * 3. 本体完整性验证
 * 4. 规则冲突检测
 * 5. 本体快照管理
 */

import type {
  Project,
  ProjectKnowledgeBase
} from "../../domain/workspace/projectTypes";
import type { Iteration, IterationChangeControl, IterationStatus } from "../../domain/workspace/types";
import { WorkspaceRepository } from "../../domain/workspace/repository";
import type { ModelSnapshot } from "../../domain/continuousModeling/types";
import { createLogger } from "../../infrastructure/runtime/logger";

const log = createLogger("ontology-service");

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type OntologyDiffResult = {
  affectedTerms: string[];
  affectedEntities: string[];
  affectedRules: string[];
  affectedArtifacts: string[];
  addedTerms: string[];
  removedTerms: string[];
  changedArtifacts: string[];
  summary: string;
  impactLevel: "none" | "low" | "medium" | "high";
};

export type OntologyCompletenessCheck = {
  passed: boolean;
  gate: "go" | "caution" | "block";
  issues: string[];
  score: number;
  summary: string;
};

export type BusinessRule = {
  rule: string;
  source: "user-conversation" | "analysis" | "ontology-inference";
  relatedEntities: string[];
  relatedApis: string[];
  relatedCodePaths: string[];
  relatedRequirements: string[];
  status: "active" | "deprecated" | "conflict";
  conflictDetails?: string[];
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// 本体差异检测器
// ---------------------------------------------------------------------------

class OntologyDiffDetector {
  /**
   * 检测代码变更对本体的影响
   */
  detectCodeChangeImpact(
    changedFiles: string[],
    baseline: ModelSnapshot | null,
    current: ModelSnapshot,
    knowledgeBase: ProjectKnowledgeBase
  ): OntologyDiffResult {
    const result: OntologyDiffResult = {
      affectedTerms: [],
      affectedEntities: [],
      affectedRules: [],
      affectedArtifacts: [],
      addedTerms: [],
      removedTerms: [],
      changedArtifacts: [],
      summary: "No significant impact",
      impactLevel: "none"
    };

    if (!current) {
      return result;
    }

    // 解析变更文件路径，识别受影响的术语、实体、规则
    const fileAnalysis = this.analyzeChangedFiles(changedFiles, knowledgeBase);

    // 对比快照，识别变更
    if (baseline) {
      const snapshotDiff = this.compareSnapshots(baseline, current);
      result.addedTerms.push(...snapshotDiff.addedTerms);
      result.removedTerms.push(...snapshotDiff.removedTerms);
      result.summary = snapshotDiff.summary;
      result.impactLevel = snapshotDiff.impactLevel;
    }

    // 识别受影响的规则
    result.affectedRules = this.detectRuleImpact(changedFiles, knowledgeBase.stableRules || []);

    // 识别受影响的交付物
    result.affectedArtifacts = this.detectArtifactImpact(changedFiles, knowledgeBase);

    log.info(`[ontology-diff] Diff analysis complete`, {
      affectedTerms: result.affectedTerms.length,
      affectedEntities: result.affectedEntities.length,
      affectedRules: result.affectedRules.length,
      affectedArtifacts: result.affectedArtifacts.length,
      impactLevel: result.impactLevel
    });

    return result;
  }

  private analyzeChangedFiles(changedFiles: string[], knowledgeBase: ProjectKnowledgeBase): {
    const affected = {
      terms: new Set<string>(),
      entities: new Set<string>(),
      rules: new Set<string>(),
      apis: new Set<string>()
    };

    const terms = knowledgeBase.ontologyTerms || [];
    const entities = knowledgeBase.componentInventory || [];
    const codeMap = knowledgeBase.codeMap || [];

    for (const filePath of changedFiles) {
      // 检查文件名中是否包含术语
      for (const term of terms) {
        if (filePath.toLowerCase().includes(term.term.toLowerCase())) {
          affected.terms.add(term.term);
        }
      }

      // 检查文件路径是否关联到实体
      for (const entity of entities) {
        for (const path of entity.relatedCodePaths || []) {
          if (filePath.includes(path)) {
            affected.entities.add(entity.component);
            break;
          }
        }
      }

      // 检查是否涉及 API
      for (const capability of codeMap) {
        for (const path of capability.codePaths || []) {
          if (filePath.includes(path)) {
            affected.apis.add(capability.capability);
          }
        }
      }
    }

    return {
      terms: Array.from(affected.terms),
      entities: Array.from(affected.entities),
      rules: [],
      apis: Array.from(affected.apis)
    };
  }

  private compareSnapshots(baseline: ModelSnapshot, current: ModelSnapshot): {
    const addedTerms: string[] = [];
    const removedTerms: string[] = [];
    let impactLevel: "none" as const;

    // 比较术语
    const baselineTermIds = new Set(baseline.terms.map(t => t.id));
    const currentTermIds = new Set(current.terms.map(t => t.id));

    for (const term of current.terms) {
      if (!baselineTermIds.has(term.id)) {
        addedTerms.push(term.term);
        if (impactLevel === "none") impactLevel = "low";
      }
    }

    for (const term of baseline.terms) {
      if (!currentTermIds.has(term.id)) {
        removedTerms.push(term.term);
        if (impactLevel === "none") impactLevel = "low";
      }
    }

    // 根据变更量确定影响级别
    const totalChanges = addedTerms.length + removedTerms.length;
    if (totalChanges > 10) impactLevel = "high";
    else if (totalChanges > 5) impactLevel = "medium";

    const summary = `Ontology changes: ${addedTerms.length} added, ${removedTerms.length} removed. Total: ${totalChanges}changes.`;

    return { addedTerms, removedTerms, summary, impactLevel };
  }

  private detectRuleImpact(changedFiles: string[], rules: any[]): string[] {
    const affectedRules: string[] = [];

    for (const rule of rules) {
      if (typeof rule !== "string") continue;

      // 检查规则内容是否可能受影响
      for (const filePath of changedFiles) {
        if (filePath.toLowerCase().includes(rule.toLowerCase())) {
          affectedRules.push(rule);
          break;
        }
      }
    }

    return affectedRules;
  }

  private detectArtifactImpact(changedFiles: string[], knowledgeBase: ProjectKnowledgeBase): string[] {
    const affected: string[] = [];

    // 简化实现：根据文件路径推断受影响的交付物
    for (const filePath of changedFiles) {
      if (filePath.includes("test") || filePath.includes("spec")) {
        affected.push("test-matrix");
      }
      if (filePath.includes("prd") || filePath.includes("requirement")) {
        affected.push("product-requirements-doc");
      }
      if (filePath.includes("release") || filePath.includes("delivery")) {
        affected.push("release-review");
      }
      if (filePath.includes("boundary") || filePath.includes("scope")) {
        affected.push("boundary-confirmation");
      }
    }

    return affected;
  }
}

// ---------------------------------------------------------------------------
// 本体管理器
// ---------------------------------------------------------------------------

class OntologyManager {
  /**
   * 提取并更新知识库
   */
  extractAndUpdateKnowledge(
    projectId: number,
    analysisReport: any,
    repo: WorkspaceRepository
  ): {
    newTerms: string[];
    updatedTerms: string[];
    newRules: string[];
    updatedEntities: string[];
  } {
    const project = repo.findProject(projectId);
    if (!project) return;

    const existingKb = project.knowledgeBase || {};

    const domainKnowledge = analysisReport?.domainKnowledge || {};

    // 提取术语
    const terms = (domainKnowledge.terms || []).map((t: any) => ({
      term: t.term,
      aliases: t.mappedTo?.entities || [],
      definition: t.definition,
      evidence: t.evidence
    }));

    // 提取实体
    const componentInventory = (domainKnowledge.components || []).map((c: any) => ({
      component: c.component,
      responsibility: c.responsibility || "",
      relatedRequirements: [],
      relatedCodePaths: c.relatedCodePaths || []
    }));

    // 提取规则
    const stableRules = (domainKnowledge.rules || []).map((r: any) => ({
      rule: r.rule,
      rationale: "Extracted from analysis",
      source: "analysis",
      relatedEntities: [],
      relatedApis: []
    }));

    // 合并到知识库
    const updatedKb: ProjectKnowledgeBase = {
      ...existingKb,
      ontologyTerms: this.mergeTerms(existingKb.ontologyTerms || [], terms),
      stableRules: this.mergeRules(existingKb.stableRules || [], stableRules),
      componentInventory,
      codeMap: existingKb.codeMap || [],
      decisionLog: existingKb.decisionLog || [],
      knownRisks: existingKb.knownRisks || [],
      changePatterns: existingKb.changePatterns || [],
      updatedAt: new Date().toISOString()
    };

    repo.updateProject({ ...project, knowledgeBase: updatedKb });

    log.info(`[ontology-manager] Knowledge base updated for project ${projectId}`, {
      newTerms: terms.length,
      updatedRules: stableRules.length
    });

    return {
      newTerms: terms.map(t => t.term),
      updatedTerms: [],
      newRules: stableRules.map(r => r.rule),
      updatedEntities: []
    };
  }

  private mergeTerms(existing: any[], newTerms: any[]): any[] {
    const termMap = new Map<string, any>();

    for (const term of existing) {
      termMap.set(term.term, { ...term });
    }

    const updated: any[] = [];
    for (const term of newTerms) {
      const existing = termMap.get(term.term);
      if (existing) {
        // 合并别名
        const mergedAliases = new Set([
          ...(existing.aliases || []),
          ...(term.aliases || [])
        ]);
        termMap.set(term.term, {
          ...existing,
          aliases: Array.from(mergedAliases)
        });
        updated.push({ ...existing });
      } else {
        termMap.set(term.term, term);
        updated.push(term);
      }
    }

    return Array.from(termMap.values());
  }

  private mergeRules(existing: any[], newRules: any[]): any[] {
    const ruleSet = new Set<string>();

    for (const rule of existing) {
      ruleSet.add(rule.rule);
    }

    const updated: any[] = [];
    for (const rule of newRules) {
      updated.push(rule);
      ruleSet.add(rule.rule);
    }

    return Array.from(ruleSet.values());
  }
}

// ---------------------------------------------------------------------------
// 规则管理器
// ---------------------------------------------------------------------------

class RuleManager {
  /**
   * 识别业务规则
   */
  identifyBusinessRules(message: string): string[] {
    const rules: string[] = [];

    // 简化的规则识别模式
    const patterns = [
      { pattern: /(?:如果|当)(?:[^。？,，]*)([^。。？,，]*)(?:必须|需要|应该|不能|禁止|允许)/g, capture: 2 },
      { pattern: /(?:订单|用户|产品)(?:[^。？,，]*)(?:超过|少于|等于|不)(?:[^。？,，]*)(?:天|小时|分钟|个)/g, capture: 2 },
      { pattern: /(?:退款|支付|发货|库存|价格)(?:[^。？,，]*)(?:自动|手动|审核|确认)/g, capture: 2 }
    ];

    for (const { pattern, capture } of patterns) {
      const match = pattern.exec(message);
      if (match) {
        const rule = message.substring(match.index, match.index + match[0].length).trim();
        if (!rules.includes(rule)) {
          rules.push(rule);
        }
      }
    }

    return rules;
  }

  /**
   * 检测规则冲突
   */
  detectConflicts(newRule: string, existingRules: BusinessRule[]): {
    conflicts: Array<{
      existingRule: string;
      conflictType: "contradiction" | "overlap" | "ambiguity";
      reason: string;
    }> = [];

    for (const existing of existingRules) {
      if (existing.status === "deprecated") continue;

      const conflict = this.compareRules(newRule, existing.rule);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  private compareRules(rule1: string, rule2: string): {
    // 简化的冲突检测逻辑
    const keywords1 = this.extractKeywords(rule1);
    const keywords2 = this.extractKeywords(rule2);

    // 检查关键词重叠度
    const overlap = keywords1.filter(k => keywords2.some(k => k === k));

    // 检查语义冲突
    if (rule1.includes("不允许") && rule2.includes("允许")) {
      return { conflictType: "contradiction", reason: "语义冲突：一个允许，一个不允许" };
    }

    if (overlap.length > 0) {
      return { conflictType: "overlap", reason: `规则内容高度相似：${overlap.join(", ")}` };
    }

    return null;
  }

  private extractKeywords(rule: string): string[] {
    // 简化的关键词提取
    return rule
      .replace(/[。，、]/g, " ")
      .split(" ")
      .filter(w => w.length > 1);
  }

  /**
   * 关联规则到本体元素
   */
  linkRuleToOntology(
    rule: string,
    knowledgeBase: ProjectKnowledgeBase
  ): {
    relatedEntities: string[];
    relatedApis: string[];
    relatedCodePaths: string[];
  } {
    const keywords = this.extractKeywords(rule);

    const entities = knowledgeBase.componentInventory || [];
    const relatedEntities = entities
      .filter(e => keywords.some(k => e.component?.toLowerCase().includes(k.toLowerCase()) || e.responsibility?.toLowerCase().includes(k)))
      .map(e => e.component);

    const codeMap = knowledgeBase.codeMap || [];
    const apis = codeMap
      .filter(c => c.capability?.toLowerCase().includes(k.toLowerCase()))
      .map(c => c.capability);

    const relatedCodePaths = apis
      .flatMap(c => c.codePaths || [])
      .filter(p => keywords.some(k => p.toLowerCase().includes(k.toLowerCase())));

    return { relatedEntities, relatedApis, relatedCodePaths };
  }
}

// ---------------------------------------------------------------------------
// 验证器
// ---------------------------------------------------------------------------

class OntologyValidator {
  /**
   * 检查本体完整性
   */
  checkCompleteness(
    iteration: Iteration,
    knowledgeBase: ProjectKnowledgeBase,
    snapshot: ModelSnapshot | null
  ): OntologyCompletenessCheck {
    const issues: string[] = [];

    // 检查需求映射
    if (iteration.scope) {
      const unmapped = (iteration.scope.inScope || [])
        .filter(req => !this.isRequirementMapped(req, knowledgeBase, snapshot));

      if (unmapped.length > 0) {
        issues.push(`未映射需求：${unmapped.join("、")}`);
      }
    }

    // 检查规则关联
    const unlinkedRules = (knowledgeBase.stableRules || [])
      .filter(rule => rule.relatedEntities.length === 0 && rule.relatedApis.length === 0);

    if (unlinkedRules.length > 0) {
      issues.push(`未关联规则：${unlinkedRules.map(r => r.rule).slice(0, 3)}...`);
    }

    // 计算得分
    const score = Math.max(0, 100 - issues.length * 10);

    // 确定结论
    let gate: "go";
    if (score < 50) gate = "block";
    else if (score < 80) gate = "caution";

    const summary = gate === "go" ? "本体完整性检查通过"
      : gate === "caution" ? `本体完整性检查通过，但有 ${issues.length} 个问题`
      : `本体完整性检查不通过，发现 ${issues.length} 个阻断问题`;

    return {
      passed: gate !== "block",
      gate,
      issues,
      score,
      summary
    };
  }

  private isRequirementMapped(requirement: string, knowledgeBase: ProjectKnowledgeBase, snapshot: ModelSnapshot | null): boolean {
    const keywords = requirement.toLowerCase().split(/\s+/);
    const terms = knowledgeBase.ontologyTerms || [];

    for (const term of terms) {
      if (keywords.some(k => term.term.toLowerCase().includes(k))) {
        return true;
      }
    }

    // 检查实体关联
    const entities = knowledgeBase.componentInventory || [];
    for (const entity of entities) {
      if (keywords.some(k => entity.component?.toLowerCase().includes(k))) {
        return true;
      }
    }

    return false;
  }
}

// ---------------------------------------------------------------------------
// 导出服务类
// ---------------------------------------------------------------------------

class OntologyService {
  private readonly repo: WorkspaceRepository;
  private readonly diffDetector = new OntologyDiffDetector();
  private readonly manager = new OntologyManager();
  private readonly ruleManager = new RuleManager();
  private readonly validator = new OntologyValidator();

  constructor(repo: WorkspaceRepository) {
    this.repo = repo;
  }

  /**
   * 从分析报告提取并更新知识库
   */
  extractAndUpdate(
    projectId: number,
    analysisReport: any
  ): {
    return this.manager.extractAndUpdateKnowledge(projectId, analysisReport, this.repo);
  }

  /**
   * 检测代码变更对本体的影响
   */
  detectCodeChangeImpact(
    projectId: number,
    iterationId: number,
    changedFiles: string[]
  ): OntologyDiffResult {
    const project = this.repo.findProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const knowledgeBase = project.knowledgeBase || {};

    // 简化实现：不使用 snapshot
    return this.diffDetector.detectCodeChangeImpact(
      changedFiles,
      null,
      null,
      knowledgeBase
    );
  }

  /**
   * 识别业务规则
   */
  identifyBusinessRules(message: string): string[] {
    return this.ruleManager.identifyBusinessRules(message);
  }

  /**
   * 检测规则冲突
   */
  detectRuleConflicts(newRule: string, existingRules: BusinessRule[]): {
    return this.ruleManager.detectConflicts(newRule, existingRules);
  }

  /**
   * 关联规则到本体
   */
  linkRuleToOntology(rule: string, projectId: number): {
    const project = this.repo.findProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const knowledgeBase = project.knowledgeBase || {};
    return this.ruleManager.linkRuleToOntology(rule, knowledgeBase);
  }

  /**
   * 检查本体完整性
   */
  checkCompleteness(
    projectId: number,
    iterationId: number
  ): OntologyCompletenessCheck {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      throw new Error("Iteration not found");
    }

    const project = this.repo.findProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const knowledgeBase = project.knowledgeBase || {};
    return this.validator.checkCompleteness(iteration, knowledgeBase, null);
  }
}

export { OntologyDiffResult, OntologyCompletenessCheck, BusinessRule };
