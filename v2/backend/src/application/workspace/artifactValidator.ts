/**
 * Artifact Validator — 交付物输出验证器
 *
 * 验证 LLM 输出是否符合 Schema 约束，提供详细的错误信息。
 * 支持重试逻辑和错误修复建议。
 */

import { getArtifactSchema, type TestCase, type TestMatrixArtifact } from "../../domain/workspace/artifactSchemas";
import { createLogger } from "../../infrastructure/runtime/logger";

const log = createLogger("artifact-validator");

// ---------------------------------------------------------------------------
// 验证结果类型
// ---------------------------------------------------------------------------

export type ValidationError = {
  field: string;
  message: string;
  severity: "error" | "warning";
  suggestedFix?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  canRetry: boolean;
};

// ---------------------------------------------------------------------------
// JSON Schema 验证器（简化版）
// ---------------------------------------------------------------------------

class SchemaValidator {
  /**
   * 验证对象是否符合 Schema
   */
  validate(schema: any, data: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // 检查类型
    if (!this.validateType(schema, data, "", errors)) {
      return { valid: false, errors, warnings, canRetry: true };
    }

    // 检查必填字段
    if (schema.required) {
      this.validateRequired(schema, data, "", errors);
    }

    // 检查属性约束
    if (schema.properties) {
      this.validateProperties(schema, data, "", errors, warnings);
    }

    const valid = errors.length === 0;
    return { valid, errors, warnings, canRetry: valid };
  }

  private validateType(schema: any, data: any, path: string, errors: ValidationError[]): boolean {
    if (data === null || data === undefined) {
      if (schema.type === "array" || schema.enum) {
        errors.push({
          field: path,
          message: `Required field is missing`,
          severity: "error",
          suggestedFix: "Provide the required value"
        });
        return false;
      }
      return true; // 允许对象字段缺失
    }

    switch (schema.type) {
      case "string":
        if (typeof data !== "string") {
          errors.push({
            field: path,
            message: `Expected string, got ${typeof data}`,
            severity: "error",
            suggestedFix: `Convert to string: ${JSON.stringify(data)}`
          });
          return false;
        }
        if (schema.minLength && data.length < schema.minLength) {
          errors.push({
            field: path,
            message: `String too short, minimum ${schema.minLength} chars`,
            severity: "error",
            suggestedFix: `Add at least ${schema.minLength - data.length} more characters`
          });
          return false;
        }
        if (schema.maxLength && data.length > schema.maxLength) {
          warnings.push({
            field: path,
            message: `String too long, maximum ${schema.maxLength} chars`,
            severity: "warning",
            suggestedFix: `Trim to ${schema.maxLength} characters`
          });
        }
        if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
          errors.push({
            field: path,
            message: `String does not match pattern ${schema.pattern}`,
            severity: "error",
            suggestedFix: `Ensure format matches: ${schema.pattern}`
          });
          return false;
        }
        break;

      case "number":
        if (typeof data !== "number") {
          errors.push({
            field: path,
            message: `Expected number, got ${typeof data}`,
            severity: "error"
          });
          return false;
        }
        break;

      case "array":
        if (!Array.isArray(data)) {
          errors.push({
            field: path,
            message: `Expected array, got ${typeof data}`,
            severity: "error",
            suggestedFix: `Convert to array: [${JSON.stringify(data)}]`
          });
          return false;
        }
        if (schema.minItems && data.length < schema.minItems) {
          errors.push({
            field: path,
            message: `Array too short, minimum ${schema.minItems} items`,
            severity: "error",
            suggestedFix: `Add at least ${schema.minItems - data.length} more items`
          });
          return false;
        }
        // 验证数组元素
        if (schema.items && schema.items.type) {
          for (let i = 0; i < data.length; i++) {
            const itemPath = `${path}[${i}]`;
            if (!this.validateType(schema.items, data[i], itemPath, errors)) {
              return false;
            }
          }
        }
        break;

      case "object":
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push({
            field: path,
            message: `Expected object, got ${typeof data}`,
            severity: "error"
          });
          return false;
        }
        break;

      case "boolean":
        if (typeof data !== "boolean") {
          errors.push({
            field: path,
            message: `Expected boolean, got ${typeof data}`,
            severity: "error",
            suggestedFix: `Use true or false`
          });
          return false;
        }
        break;
    }

    if (schema.enum && !schema.enum.includes(data)) {
      errors.push({
        field: path,
        message: `Value must be one of: ${schema.enum.join(", ")}`,
        severity: "error",
        suggestedFix: `Use one of the allowed values`
      });
      return false;
    }

    return true;
  }

  private validateRequired(schema: any, data: any, path: string, errors: ValidationError[]): void {
    if (!schema.required || !data) return;

    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push({
          field: `${path}.${field}`,
          message: `Required field is missing`,
          severity: "error",
          suggestedFix: `Add the "${field}" field with appropriate value`
        });
      }
    }
  }

  private validateProperties(schema: any, data: any, path: string, errors: ValidationError[], warnings: ValidationError[]): void {
    if (!schema.properties || !data) return;

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const value = data[key];
      const fieldPath = path ? `${path}.${key}` : key;

      if (value !== undefined && value !== null) {
        this.validate(propSchema, value, fieldPath, errors, warnings);
      }
    }
  }

  private validate(schema: any, data: any, path: string, errors: ValidationError[], warnings: ValidationError[]): void {
    this.validateType(schema, data, path, errors);
    this.validateRequired(schema, data, path, errors);
    this.validateProperties(schema, data, path, errors, warnings);
  }
}

const validator = new SchemaValidator();

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 验证交付物内容
 */
export function validateArtifactDraft(
  artifactId: string,
  content: string
): ValidationResult {
  const schema = getArtifactSchema(artifactId);

  if (!schema) {
    log.warn(`No schema found for artifactId: ${artifactId}`);
    return {
      valid: false,
      errors: [{ field: "artifactId", message: `Unknown artifact type: ${artifactId}`, severity: "error" }],
      warnings: [],
      canRetry: false
    };
  }

  try {
    const data = JSON.parse(content);
    const result = validator.validate(schema, data);

    if (!result.valid) {
      log.warn(`Artifact validation failed for ${artifactId}:`, result.errors);
    }

    return result;
  } catch (error) {
    log.warn(`Failed to parse artifact content for ${artifactId}:`, error);
    return {
      valid: false,
      errors: [{
        field: "content",
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
        suggestedFix: "Ensure valid JSON format"
      }],
      warnings: [],
      canRetry: true
    };
  }
}

/**
 * 从 JSON 字符串提取 TestCase 数组（专用）
 */
export function extractTestCases(content: string): { valid: boolean; cases: TestCase[]; errors: string[] } {
  try {
    const data = JSON.parse(content);
    const schema = getArtifactSchema("test-matrix");

    if (!schema || !schema.properties.cases) {
      return { valid: false, cases: [], errors: ["Schema not found"] };
    }

    // 验证 cases 数组
    if (!Array.isArray(data.cases)) {
      return { valid: false, cases: [], errors: ["cases must be an array"] };
    }

    const cases: TestCase[] = [];
    const errors: string[] = [];

    for (let i = 0; i < data.cases.length; i++) {
      const c = data.cases[i];

      // 验证必填字段
      if (!c.caseId) {
        errors.push(`case[${i}]: missing caseId`);
        continue;
      }
      if (!c.type) {
        errors.push(`case[${i}]: missing type`);
        continue;
      }
      if (!c.focus || c.focus.trim() === "") {
        errors.push(`case[${i}]: focus is empty`);
        continue;
      }
      if (!c.expected || c.expected.trim() === "") {
        errors.push(`case[${i}]: expected is empty`);
        continue;
      }

      // 验证枚举值
      const validTypes = ["unit", "integration", "e2e", "acceptance"];
      if (!validTypes.includes(c.type)) {
        errors.push(`case[${i}]: invalid type ${c.type}`);
      }

      // 验证 caseId 格式
      if (!/^[a-zA-Z0-9_-]+$/.test(c.caseId)) {
        errors.push(`case[${i}]: caseId contains invalid characters`);
      }

      cases.push({
        caseId: c.caseId,
        type: c.type as TestCase["type"],
        focus: c.focus,
        expected: c.expected,
        evidence: c.evidence || "",
        executionStatus: c.executionStatus || "pending"
      });
    }

    return { valid: errors.length === 0, cases, errors };
  } catch (error) {
    return {
      valid: false,
      cases: [],
      errors: [`JSON parse error: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * 生成重试提示
 */
export function generateRetryPrompt(
  artifactId: string,
  errors: ValidationError[],
  originalContent: string
): string {
  const errorSummary = errors.map(e => `- ${e.field}: ${e.message}`).join("\n");
  const suggestedFixes = errors
    .filter(e => e.suggestedFix)
    .map(e => `- ${e.field}: ${e.suggestedFix}`)
    .join("\n");

  return `
上次生成的交付物 "${artifactId}" 不符合要求，存在以下问题：

错误：
${errorSummary}

${suggestedFixes ? `建议的修复方式：\n${suggestedFixes}` : ""}

请重新生成，确保：
1. 输出严格符合 JSON Schema
2. 所有必填字段都存在
3. 数据类型和格式正确
4. 数组和对象结构完整
`.trim();
}
