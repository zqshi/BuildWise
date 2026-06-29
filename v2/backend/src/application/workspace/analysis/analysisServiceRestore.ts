/**
 * analysisServiceRestore — 附件分析状态 DB 恢复
 *
 * 从 analysisService 拆出的非导出辅助：构造时从 DB 把分析任务/报告索引/报告段
 * 三张内存表恢复填充。纯查询组装，不持有状态，由 AnalysisService 构造时调用。
 */
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AttachmentUploadInput,
  AttachmentReportIndex,
  AttachmentReportSection
} from '../../../domain/workspace/types';
import type { AttachmentAnalysisJobRuntime } from './queueOps';

/**
 * 从 DB 收集全部分析任务运行态（跨项目/迭代三层遍历）。
 */
function collectAnalysisJobsFromRepo(repo: WorkspaceRepository): AttachmentAnalysisJobRuntime[] {
  const jobs: Array<AttachmentAnalysisJobRuntime> = [];
  for (const project of repo.listProjects()) {
    for (const iter of repo.listIterations(project.id)) {
      for (const row of repo.listAnalysisJobs(iter.id)) {
        jobs.push({
          ...row,
          input: (row.input ?? {}) as AttachmentUploadInput,
          inputFingerprint: row.inputFingerprint ?? ""
        } as AttachmentAnalysisJobRuntime);
      }
    }
  }
  return jobs;
}

/**
 * 把 DB 中的分析任务/报告索引/报告段恢复填充到传入的三张内存表（去重保留已有）。
 * 由 AnalysisService 构造时调用，传入 this.analysisJobs 等空 Map 首次填充。
 */
export function restoreAnalysisStateFromDb(
  repo: WorkspaceRepository,
  analysisJobs: Map<string, AttachmentAnalysisJobRuntime>,
  reportIndexesByJobId: Map<string, AttachmentReportIndex>,
  reportSectionsByReportId: Map<string, AttachmentReportSection[]>
): void {
  const allJobs = collectAnalysisJobsFromRepo(repo);
  for (const job of allJobs) {
    if (!analysisJobs.has(job.jobId)) {
      analysisJobs.set(job.jobId, job);
    }
    const reportIndex = repo.findReportIndexByJob?.(job.jobId);
    if (reportIndex && !reportIndexesByJobId.has(job.jobId)) {
      reportIndexesByJobId.set(job.jobId, reportIndex);
      const sections = repo.listReportSections?.(reportIndex.reportId) ?? [];
      if (sections.length > 0 && !reportSectionsByReportId.has(reportIndex.reportId)) {
        reportSectionsByReportId.set(reportIndex.reportId, sections);
      }
    }
  }
}
