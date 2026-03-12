# 任务拆解功能提示词

输入：目标、边界、风险、依赖。
输出：
- workPackages[]
- criticalPath[]
- ownerMap[]
- acceptanceChecklist[]

约束：
1. 所有工作包必须可验收。
2. 每个工作包必须标注 owner 和依赖。
3. 对越界工作包必须单独标记 outOfBoundary。
