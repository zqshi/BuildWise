// 拆分自 normalizeHelpers（v0.17.0 文件治理）：normalizeProject/normalizeIteration 及辅助
// 已按职责迁移至 normalizeProjectOps + normalizeChangeControlFields + normalizeIterationOps。
// 本文件保留 re-export 以兼容既有 import 路径；新代码请直接从子文件 import。
export { normalizeProject } from './normalizeProjectOps';
export { normalizeIteration } from './normalizeIterationOps';
