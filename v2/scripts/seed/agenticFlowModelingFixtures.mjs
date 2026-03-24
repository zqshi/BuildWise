export function buildAgenticFlowContinuousModelingStore(time) {
  return {
    snapshots: [
      {
        id: "snapshot-1-1-published",
        projectId: 1,
        iterationId: 1,
        version: "1.0.published",
        status: "published",
        ontologyTerms: [
          {
            canonicalTerm: "线索",
            aliases: ["商机线索", "潜在客户"],
            technicalAliases: ["Lead"],
            definition: "客户经理正在跟进、待推进状态的潜在线索对象。",
            evidence: ["V1 业务简报", "首版需求分析报告"]
          },
          {
            canonicalTerm: "跟进记录",
            aliases: ["跟进纪要", "联系记录"],
            technicalAliases: ["FollowupRecord"],
            definition: "记录每次联系动作、沟通结论和下一步计划的业务沉淀。",
            evidence: ["V1 PRD", "详情抽屉交互评审"]
          },
          {
            canonicalTerm: "线索详情抽屉",
            aliases: ["详情抽屉"],
            technicalAliases: ["LeadDetailDrawer"],
            definition: "在线索列表右侧承载当前线索详情、状态推进和跟进上下文的主操作区域。",
            evidence: ["原型评审", "设计规范"]
          },
          {
            canonicalTerm: "线索阶段",
            aliases: ["阶段状态"],
            technicalAliases: ["LeadStage"],
            definition: "标识线索当前所处业务阶段，用于推进和回看。",
            evidence: ["V1 边界确认"]
          },
          {
            canonicalTerm: "负责人",
            aliases: ["客户经理", "跟进人"],
            technicalAliases: ["SalesOwner"],
            definition: "对当前线索负主要推进责任的业务角色。",
            evidence: ["业务场景梳理"]
          }
        ],
        entities: [
          {
            id: "entity_线索",
            name: "Lead",
            businessName: "线索",
            fields: [
              { name: "leadId", type: "string", required: true },
              { name: "customerName", type: "string", required: true },
              { name: "stage", type: "LeadStage", required: true },
              { name: "ownerId", type: "SalesOwnerId", required: true },
              { name: "lastFollowupAt", type: "datetime", required: false }
            ]
          },
          {
            id: "entity_跟进记录",
            name: "FollowupRecord",
            businessName: "跟进记录",
            fields: [
              { name: "recordId", type: "string", required: true },
              { name: "leadId", type: "string", required: true },
              { name: "summary", type: "text", required: true },
              { name: "nextAction", type: "text", required: false },
              { name: "createdAt", type: "datetime", required: true }
            ]
          },
          {
            id: "entity_线索阶段",
            name: "LeadStage",
            businessName: "线索阶段",
            fields: [
              { name: "stageCode", type: "string", required: true },
              { name: "stageName", type: "string", required: true },
              { name: "sortOrder", type: "number", required: true }
            ]
          },
          {
            id: "entity_负责人",
            name: "SalesOwner",
            businessName: "负责人",
            fields: [
              { name: "ownerId", type: "string", required: true },
              { name: "ownerName", type: "string", required: true },
              { name: "teamName", type: "string", required: false }
            ]
          }
        ],
        relations: [
          {
            id: "rel-lead-followups",
            fromEntityId: "entity_线索",
            toEntityId: "entity_跟进记录",
            type: "one_to_many",
            businessMeaning: "一条线索会沉淀多条跟进记录，用来串起完整跟进历史。"
          },
          {
            id: "rel-owner-leads",
            fromEntityId: "entity_负责人",
            toEntityId: "entity_线索",
            type: "one_to_many",
            businessMeaning: "一位负责人可以同时负责多条线索，但每条线索在同一时刻只有一个主负责人。"
          },
          {
            id: "rel-stage-leads",
            fromEntityId: "entity_线索阶段",
            toEntityId: "entity_线索",
            type: "one_to_many",
            businessMeaning: "线索按照阶段推进，阶段变化会驱动列表排序和详情提示。"
          }
        ],
        rules: [
          {
            id: "rule-followup-required-for-stage-change",
            name: "状态推进前必须补充跟进记录",
            statement: "任何线索状态推进都必须附带一条新的跟进记录，确保状态变化可追溯。",
            linkedEntityIds: ["entity_线索", "entity_跟进记录", "entity_线索阶段"],
            linkedSurfaceIds: ["线索列表", "线索详情抽屉"],
            linkedApiIds: ["POST /api/v1/leads/:id/followups", "POST /api/v1/leads/:id/stage"]
          },
          {
            id: "rule-drawer-is-default-context",
            name: "详情默认在右侧抽屉完成",
            statement: "首版详情查看、状态推进和跟进沉淀必须在右侧抽屉完成，不拆独立详情页。",
            linkedEntityIds: ["entity_线索", "entity_跟进记录"],
            linkedSurfaceIds: ["线索详情抽屉"],
            linkedApiIds: []
          },
          {
            id: "rule-owner-must-be-visible",
            name: "负责人必须在列表可见",
            statement: "列表主视图必须直接展示负责人，避免用户进入详情后才能判断当前归属。",
            linkedEntityIds: ["entity_线索", "entity_负责人"],
            linkedSurfaceIds: ["线索列表"],
            linkedApiIds: []
          }
        ],
        reviewTasks: [
          {
            id: "review-v1-shared-ownership",
            type: "entity_confirmation",
            title: "确认线索是否允许多人共同负责",
            description: "当前模型采用单主负责人，如果业务允许联合跟进，需要新增协同归属关系。",
            blocking: false
          }
        ],
        derivedFromSnapshotId: null,
        createdAt: time.t6
      },
      {
        id: "snapshot-1-2-candidate",
        projectId: 1,
        iterationId: 2,
        version: "1.1.candidate",
        status: "candidate",
        ontologyTerms: [
          {
            canonicalTerm: "线索导出",
            aliases: ["导出任务", "名单导出"],
            technicalAliases: ["ExportJob"],
            definition: "把当前筛选后的线索结果生成文件并交付下载的业务动作。",
            evidence: ["V1.1 变更说明", "导出入口原型"]
          },
          {
            canonicalTerm: "导出结果包",
            aliases: ["导出文件"],
            technicalAliases: ["ExportFile"],
            definition: "线索导出完成后生成的文件结果，用于业务带出和离线流转。",
            evidence: ["V1.1 技术架构"]
          },
          {
            canonicalTerm: "提醒对象",
            aliases: ["被提醒同事"],
            technicalAliases: ["MentionTarget"],
            definition: "理论上会被 @提醒 的协作对象，本轮已确认延期不上线。",
            evidence: ["V1.1 差异分析", "首轮评审阻断记录"]
          }
        ],
        entities: [
          {
            id: "entity_线索",
            name: "Lead",
            businessName: "线索",
            fields: [
              { name: "leadId", type: "string", required: true },
              { name: "customerName", type: "string", required: true },
              { name: "stage", type: "LeadStage", required: true },
              { name: "ownerId", type: "SalesOwnerId", required: true },
              { name: "lastFollowupAt", type: "datetime", required: false }
            ]
          },
          {
            id: "entity_跟进记录",
            name: "FollowupRecord",
            businessName: "跟进记录",
            fields: [
              { name: "recordId", type: "string", required: true },
              { name: "leadId", type: "string", required: true },
              { name: "summary", type: "text", required: true },
              { name: "nextAction", type: "text", required: false },
              { name: "createdAt", type: "datetime", required: true }
            ]
          },
          {
            id: "entity_负责人",
            name: "SalesOwner",
            businessName: "负责人",
            fields: [
              { name: "ownerId", type: "string", required: true },
              { name: "ownerName", type: "string", required: true },
              { name: "teamName", type: "string", required: false }
            ]
          },
          {
            id: "entity_线索导出任务",
            name: "ExportJob",
            businessName: "线索导出任务",
            fields: [
              { name: "jobId", type: "string", required: true },
              { name: "requestedBy", type: "SalesOwnerId", required: true },
              { name: "filterSnapshot", type: "json", required: true },
              { name: "status", type: "string", required: true }
            ]
          },
          {
            id: "entity_导出结果包",
            name: "ExportFile",
            businessName: "导出结果包",
            fields: [
              { name: "fileId", type: "string", required: true },
              { name: "jobId", type: "string", required: true },
              { name: "downloadUrl", type: "string", required: true },
              { name: "expiredAt", type: "datetime", required: false }
            ]
          }
        ],
        relations: [
          {
            id: "rel-owner-export-job",
            fromEntityId: "entity_负责人",
            toEntityId: "entity_线索导出任务",
            type: "one_to_many",
            businessMeaning: "负责人可以发起多次导出，但每次导出都属于一个明确发起人。"
          },
          {
            id: "rel-export-job-leads",
            fromEntityId: "entity_线索导出任务",
            toEntityId: "entity_线索",
            type: "many_to_many",
            businessMeaning: "一次导出会命中一批线索，线索也可能被不同导出任务多次带出。"
          },
          {
            id: "rel-export-job-file",
            fromEntityId: "entity_线索导出任务",
            toEntityId: "entity_导出结果包",
            type: "one_to_one",
            businessMeaning: "每个导出任务最终生成一个可下载的结果包。"
          },
          {
            id: "rel-lead-followups-v11",
            fromEntityId: "entity_线索",
            toEntityId: "entity_跟进记录",
            type: "one_to_many",
            businessMeaning: "即使引入导出能力，线索和跟进记录的主关系也必须保持稳定。"
          }
        ],
        rules: [
          {
            id: "rule-export-cannot-break-core-flow",
            name: "导出能力不得影响主跟进链路",
            statement: "导出任务必须异步执行，不能阻塞线索录入、状态推进和跟进记录保存。",
            linkedEntityIds: ["entity_线索导出任务", "entity_线索", "entity_跟进记录"],
            linkedSurfaceIds: ["线索列表"],
            linkedApiIds: ["POST /api/v1/exports", "GET /api/v1/exports/:id"]
          },
          {
            id: "rule-mention-delayed",
            name: "@提醒本轮延期不上线",
            statement: "@提醒因为影响跟进记录保存已从当前主链路移除，仅保留后续候选知识，不进入本轮发布范围。",
            linkedEntityIds: ["entity_跟进记录"],
            linkedSurfaceIds: ["线索详情抽屉"],
            linkedApiIds: []
          },
          {
            id: "rule-export-follows-filter",
            name: "导出结果必须尊重当前筛选条件",
            statement: "导出结果包必须与用户当前列表筛选一致，不能越权混入未展示线索。",
            linkedEntityIds: ["entity_线索导出任务", "entity_线索", "entity_导出结果包"],
            linkedSurfaceIds: ["线索列表"],
            linkedApiIds: ["POST /api/v1/exports"]
          }
        ],
        reviewTasks: [
          {
            id: "review-v11-export-scope",
            type: "rule_confirmation",
            title: "确认导出字段边界",
            description: "请确认导出结果包中是否允许包含手机号、备注等敏感字段。",
            blocking: true
          },
          {
            id: "review-v11-mention-delay",
            type: "conflict_resolution",
            title: "记录 @提醒延期结论",
            description: "请确认 @提醒 已从本轮范围中移除，并作为后续候选需求沉淀。",
            blocking: false
          }
        ],
        derivedFromSnapshotId: "snapshot-1-1-published",
        createdAt: time.t16
      }
    ]
  };
}
