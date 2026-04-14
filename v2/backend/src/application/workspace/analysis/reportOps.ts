import type { AttachmentAnalysisReport, AttachmentReportSection } from '../../../domain/workspace/types';

export function buildAttachmentReportSections(params: {
  reportId: string;
  report: AttachmentAnalysisReport;
  now: string;
  newSectionId: () => string;
}): AttachmentReportSection[] {
  const { reportId, report, now, newSectionId } = params;
  const findings = (report.meaningfulFindings || []).map((item) => ({ text: item }));
  const risks = (report.risks || []).map((item) => ({ text: item }));
  const traceabilityItems = [
    ...(report.traceabilityMap?.unmappedRequirements || []).map((item) => `未映射需求：${item}`),
    ...(report.traceabilityMap?.conflicts || []).map((item) => `冲突：${item}`),
    ...(report.traceabilityMap?.gaps || []).map((item) => `缺口：${item}`)
  ].map((item) => ({ text: item }));
  return [
    {
      sectionId: newSectionId(),
      reportId,
      sectionKey: "overview",
      sectionOrder: 1,
      status: "ready",
      itemCount: 1,
      updatedAt: now,
      content: {
        understanding: report.understanding || "",
        summary: report.businessConfirmation?.necessityAssessment?.rationale || "",
        items: [
          {
            project: report.projectDetection?.projectName || "",
            product: report.projectDetection?.productName || "",
            confidence: report.projectDetection?.confidence || "low"
          }
        ]
      }
    },
    {
      sectionId: newSectionId(),
      reportId,
      sectionKey: "projectDetection",
      sectionOrder: 2,
      status: "ready",
      itemCount: 1,
      updatedAt: now,
      content: {
        items: [
          {
            projectName: report.projectDetection?.projectName || "",
            productName: report.projectDetection?.productName || "",
            confidence: report.projectDetection?.confidence || "low",
            evidence: report.projectDetection?.evidence || []
          }
        ]
      }
    },
    {
      sectionId: newSectionId(),
      reportId,
      sectionKey: "findings",
      sectionOrder: 3,
      status: findings.length > 0 ? "ready" : "empty",
      itemCount: findings.length,
      updatedAt: now,
      content: { items: findings }
    },
    {
      sectionId: newSectionId(),
      reportId,
      sectionKey: "risks",
      sectionOrder: 4,
      status: risks.length > 0 ? "ready" : "empty",
      itemCount: risks.length,
      updatedAt: now,
      content: { items: risks }
    },
    {
      sectionId: newSectionId(),
      reportId,
      sectionKey: "traceability",
      sectionOrder: 5,
      status: traceabilityItems.length > 0 ? "ready" : "empty",
      itemCount: traceabilityItems.length,
      updatedAt: now,
      content: { items: traceabilityItems }
    },
    {
      sectionId: newSectionId(),
      reportId,
      sectionKey: "appendix",
      sectionOrder: 6,
      status: "ready",
      itemCount: report.clarificationQuestions.length,
      updatedAt: now,
      content: {
        items: (report.clarificationQuestions || []).map((item) => ({ text: item })),
        releaseReview: report.releaseReview || null
      }
    }
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
