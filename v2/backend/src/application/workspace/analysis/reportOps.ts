import type { AttachmentAnalysisReport, AttachmentReportSection } from '../../../domain/workspace/types';
import { sanitizeDisplayItem } from '../coach/messageSanitizer';

type SectionCtx = { reportId: string; now: string; newSectionId: () => string };

function buildOverviewSection(report: AttachmentAnalysisReport, ctx: SectionCtx): AttachmentReportSection {
  return {
    sectionId: ctx.newSectionId(), reportId: ctx.reportId, sectionKey: "overview", sectionOrder: 1, status: "ready", itemCount: 1, updatedAt: ctx.now,
    content: {
      understanding: sanitizeDisplayItem(report.understanding || ""),
      summary: report.businessConfirmation?.necessityAssessment?.rationale || "",
      items: [{ project: report.projectDetection?.projectName || "", product: report.projectDetection?.productName || "", confidence: report.projectDetection?.confidence || "low" }],
    },
  };
}

function buildProjectDetectionSection(report: AttachmentAnalysisReport, ctx: SectionCtx): AttachmentReportSection {
  return {
    sectionId: ctx.newSectionId(), reportId: ctx.reportId, sectionKey: "projectDetection", sectionOrder: 2, status: "ready", itemCount: 1, updatedAt: ctx.now,
    content: { items: [{ projectName: report.projectDetection?.projectName || "", productName: report.projectDetection?.productName || "", confidence: report.projectDetection?.confidence || "low", evidence: (report.projectDetection?.evidence || []).map(sanitizeDisplayItem).filter(Boolean) }] },
  };
}

function buildListSection(key: AttachmentReportSection["sectionKey"], order: number, items: Array<{ text: string }>, ctx: SectionCtx): AttachmentReportSection {
  return {
    sectionId: ctx.newSectionId(), reportId: ctx.reportId, sectionKey: key, sectionOrder: order,
    status: items.length > 0 ? "ready" : "empty", itemCount: items.length, updatedAt: ctx.now, content: { items },
  };
}

export function buildAttachmentReportSections(params: {
  reportId: string;
  report: AttachmentAnalysisReport;
  now: string;
  newSectionId: () => string;
}): AttachmentReportSection[] {
  const { reportId, report, now, newSectionId } = params;
  const ctx: SectionCtx = { reportId, now, newSectionId };
  const findings = (report.meaningfulFindings || []).map((item) => ({ text: sanitizeDisplayItem(item) })).filter((item) => item.text);
  const risks = (report.risks || []).map((item) => ({ text: sanitizeDisplayItem(item) })).filter((item) => item.text);
  const traceabilityItems = [
    ...(report.traceabilityMap?.unmappedRequirements || []).map((item) => `未映射需求：${sanitizeDisplayItem(item)}`),
    ...(report.traceabilityMap?.conflicts || []).map((item) => `冲突：${sanitizeDisplayItem(item)}`),
    ...(report.traceabilityMap?.gaps || []).map((item) => `缺口：${sanitizeDisplayItem(item)}`)
  ].map((item) => ({ text: item })).filter((item) => item.text);
  const appendixItems = (report.clarificationQuestions || []).map((item) => ({ text: sanitizeDisplayItem(item) })).filter((item) => item.text);
  return [
    buildOverviewSection(report, ctx),
    buildProjectDetectionSection(report, ctx),
    buildListSection("findings", 3, findings, ctx),
    buildListSection("risks", 4, risks, ctx),
    buildListSection("traceability", 5, traceabilityItems, ctx),
    { ...buildListSection("appendix", 6, appendixItems, ctx), status: "ready", content: { items: appendixItems, releaseReview: report.releaseReview || null } },
  ];
}

export function getAttachmentReportSectionPage(
  sections: AttachmentReportSection[],
  sectionKey: AttachmentReportSection["sectionKey"],
  cursor = 0,
  limit = 20
) {
  const section = sections.find((item) => item.sectionKey === sectionKey);
  if (!section) {
    return null;
  }
  const items = Array.isArray(section.content?.items) ? (section.content.items as unknown[]) : [];
  const safeCursor = Math.max(0, Number.isFinite(cursor) ? Math.floor(cursor) : 0);
  const safeLimit = Math.max(1, Math.min(200, Number.isFinite(limit) ? Math.floor(limit) : 20));
  const slice = items.slice(safeCursor, safeCursor + safeLimit);
  return {
    sectionId: section.sectionId,
    status: section.status,
    cursor: safeCursor,
    limit: safeLimit,
    nextCursor: safeCursor + safeLimit < items.length ? safeCursor + safeLimit : null,
    total: items.length,
    data: {
      ...section.content,
      items: slice
    }
  };
}
