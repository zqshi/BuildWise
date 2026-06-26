export async function runContractLifecycleScenario(context, state) {
  const { assert, getJson, request } = context;
  const createdIterationId = state.createdIterationId;
  const scopedAcceptanceCriteria = state.scopedAcceptanceCriteria || [];
  assert(Number.isInteger(createdIterationId), "created iteration id must exist before lifecycle scenario");

  const acceptanceConfirmed = await request(`/api/v1/iterations/${createdIterationId}/change-control/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accurate: true,
      actor: "contract-bot",
      note: "seed acceptance checks from scope acceptanceCriteria",
      boundary: {
        requirementRefs: ["REQ-acceptance-propagation"],
        componentRefs: ["dashboard/kpi-card"],
        codePaths: ["apps/web/src/pages/dashboard.tsx"],
        note: "contract acceptance boundary"
      }
    })
  });
  assert(acceptanceConfirmed.res.status === 200, "initial confirmation should return 200");
  assert(
    Array.isArray(acceptanceConfirmed.payload?.executableConstraints?.acceptanceChecks) &&
      acceptanceConfirmed.payload.executableConstraints.acceptanceChecks.includes(scopedAcceptanceCriteria[0]),
    "analysis confirmation should keep scope acceptance criteria in executable constraints"
  );

  const acceptanceBoundaryUpdate = await request(`/api/v1/iterations/${createdIterationId}/change-control/boundary`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requirementRefs: ["REQ-acceptance-propagation", "REQ-dashboard-kpi"],
      componentRefs: ["dashboard/kpi-card", "dashboard/distribution-chart"],
      codePaths: ["apps/web/src/pages/dashboard.tsx", "apps/api/v1/src/dashboard.ts"],
      note: "expand boundary and keep acceptance checks"
    })
  });
  assert(acceptanceBoundaryUpdate.res.status === 200, "acceptance boundary update should return 200");
  assert(
    Array.isArray(acceptanceBoundaryUpdate.payload?.executableConstraints?.acceptanceChecks) &&
      acceptanceBoundaryUpdate.payload.executableConstraints.acceptanceChecks.includes(scopedAcceptanceCriteria[1]),
    "boundary update should not drop scope acceptance criteria from executable constraints"
  );

  const releaseReviewWithAcceptanceGap = await request(`/api/v1/iterations/${createdIterationId}/release-review`);
  assert(releaseReviewWithAcceptanceGap.res.status === 200, "release review with acceptance gap should return 200");
  assert(releaseReviewWithAcceptanceGap.payload?.decision === "block", "release review should be blocked when acceptance criteria are not fully covered");
  assert(
    Array.isArray(releaseReviewWithAcceptanceGap.payload?.blockers) &&
      releaseReviewWithAcceptanceGap.payload.blockers.some((item) => item.includes("验收标准未完全覆盖")),
    "release review blockers should include acceptance coverage gap"
  );

  const analysisResult = await request(`/api/v1/iterations/${createdIterationId}/analysis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: "ui-v2.png",
      mimeType: "image/png",
      size: 2048,
      excerpt: "新增用户画像组件并调整仪表盘 KPI 卡片布局"
    })
  });

  assert(analysisResult.res.status === 200 || analysisResult.res.status === 502 || analysisResult.res.status === 503, "analysis should return 200 or 502/503");
  if (analysisResult.res.status === 200) {
    assert(typeof analysisResult.payload?.understanding === "string", "analysis understanding must exist");
    assert(typeof analysisResult.payload?.projectDetection?.projectName === "string", "analysis projectDetection.projectName must exist");
    assert(typeof analysisResult.payload?.projectDetection?.productName === "string", "analysis projectDetection.productName must exist");
    assert(typeof analysisResult.payload?.projectDetection?.confidence === "string", "analysis projectDetection.confidence must exist");
    assert(Array.isArray(analysisResult.payload?.meaningfulFindings), "analysis meaningfulFindings must be array");
    assert(Array.isArray(analysisResult.payload?.prioritizedFindings), "analysis prioritizedFindings must be array");
    assert(Array.isArray(analysisResult.payload?.nextActions), "analysis nextActions must be array");
    assert(analysisResult.payload?.llmContext?.strategy === "direct", "analysis llmContext strategy should be direct");
    assert(typeof analysisResult.payload?.llmContext?.promptContextLength === "number", "analysis llmContext prompt length must exist");
    assert(typeof analysisResult.payload?.llmContext?.degraded === "boolean", "analysis llmContext degraded must exist");
    assert(typeof analysisResult.payload?.llmContext?.degradeReason === "string", "analysis llmContext degradeReason must exist");
    assert(Array.isArray(analysisResult.payload?.clarificationQuestions), "analysis clarificationQuestions must exist");

    const chunkedAnalysisResult = await request(`/api/v1/iterations/${createdIterationId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "large-prd.md",
        mimeType: "text/markdown",
        size: 20480,
        excerpt: "这是附件摘要头部。",
        excerptChunks: [
          "chunk-1: 新增结算流程与发票状态联动",
          "chunk-2: 调整仪表盘 KPI 定义与统计口径",
          "chunk-3: 增加发布前回滚演练验收"
        ],
        excerptDigest: "strategy=chunked-head-middle-tail;chunks=3;digest=test-contract",
        excerptStrategy: "chunked-head-middle-tail"
      })
    });
    assert(chunkedAnalysisResult.res.status === 200, "chunked analysis should return 200");
    assert(chunkedAnalysisResult.payload?.llmContext?.strategy === "chunked-head-middle-tail", "chunked analysis should keep strategy");
    assert(chunkedAnalysisResult.payload?.llmContext?.chunkCount === 3, "chunked analysis chunk count should be 3");
    assert(typeof chunkedAnalysisResult.payload?.llmContext?.unknownSignalCount === "number", "unknown signal count must exist");

    const folderAnalysisResult = await request(`/api/v1/iterations/${createdIterationId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "sample-folder",
        sourceType: "folder",
        folderName: "sample-folder",
        mimeType: "application/x-directory",
        size: 4096,
        files: [
          {
            path: "sample-folder/README.md",
            fileName: "README.md",
            mimeType: "text/markdown",
            size: 512,
            excerpt: "产品: 供应链协同平台\n项目: 订单可视化改造\n新增订单仪表盘和KPI看板"
          },
          {
            path: "sample-folder/openapi.json",
            fileName: "openapi.json",
            mimeType: "application/json",
            size: 1024,
            excerpt: "{\"paths\":{\"/orders\":{\"get\":{\"summary\":\"订单列表\"}}}}"
          }
        ],
        excerptStrategy: "folder-batch",
        excerptDigest: "strategy=folder-batch;files=2;textFiles=2;binaryFiles=0"
      })
    });
    assert(folderAnalysisResult.res.status === 200, "folder analysis should return 200");
    assert(folderAnalysisResult.payload?.sourceType === "folder", "folder analysis sourceType should be folder");
    assert(folderAnalysisResult.payload?.fileStats?.totalFiles === 2, "folder analysis total files should be 2");
    assert(typeof folderAnalysisResult.payload?.fileSelection?.includedFiles === "number", "folder analysis fileSelection should exist");
    assert(Array.isArray(folderAnalysisResult.payload?.fileSelection?.ignoredFiles), "folder analysis ignored files should exist");
    assert(typeof folderAnalysisResult.payload?.projectDetection?.projectCategory === "string", "folder analysis project category should exist");
    assert(Array.isArray(folderAnalysisResult.payload?.meaningfulFindings), "folder analysis meaningful findings should exist");
    assert(Array.isArray(folderAnalysisResult.payload?.prioritizedFindings), "folder analysis prioritized findings should exist");

    const binaryAnalysisResult = await request(`/api/v1/iterations/${createdIterationId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "prototype.fig",
        mimeType: "application/octet-stream",
        size: 102400,
        excerpt: "",
        excerptStrategy: "binary-no-text",
        excerptDigest: "strategy=binary-no-text;chunks=0"
      })
    });
    assert(binaryAnalysisResult.res.status === 200, "binary analysis should return 200");
    assert(binaryAnalysisResult.payload?.llmContext?.strategy === "binary-no-text", "binary strategy should be preserved");
    assert(binaryAnalysisResult.payload?.llmContext?.degraded === true, "binary analysis should trigger degraded mode");
    assert(
      typeof binaryAnalysisResult.payload?.llmContext?.degradeReason === "string" &&
        binaryAnalysisResult.payload.llmContext.degradeReason.includes("binary-no-text"),
      "binary analysis should expose degrade reason"
    );
    assert(
      Array.isArray(binaryAnalysisResult.payload?.clarificationQuestions) &&
        binaryAnalysisResult.payload.clarificationQuestions.length >= 1,
      "binary analysis should generate clarification questions"
    );

    const pendingChangeControl = await getJson(`/api/v1/iterations/${createdIterationId}/change-control`);
    assert(pendingChangeControl.pendingHumanConfirmation === true, "analysis should require human confirmation");
    assert(Array.isArray(pendingChangeControl.clarificationQuestions) && pendingChangeControl.clarificationQuestions.length >= 1, "change-control should persist clarification questions");
    assert(Array.isArray(pendingChangeControl.clarificationDraftResolvedQuestions), "change-control should include clarification draft field");

    const draftUpdate = await request(`/api/v1/iterations/${createdIterationId}/change-control/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolvedQuestions: [pendingChangeControl.clarificationQuestions[0]] })
    });
    assert(draftUpdate.res.status === 200, "clarification draft update should return 200");
    assert(Array.isArray(draftUpdate.payload?.clarificationDraftResolvedQuestions) && draftUpdate.payload.clarificationDraftResolvedQuestions.length === 1, "clarification draft should persist resolved question");

    const blockedPublish = await request(`/api/v1/iterations/${createdIterationId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commitMessage: "chore: blocked until confirmation",
        dryRun: true
      })
    });
    assert(blockedPublish.res.status === 409, "publish should be blocked before analysis confirmation");

    const clarification = await request(`/api/v1/iterations/${createdIterationId}/change-control/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accurate: false,
        note: "analysis missing billing flow details"
      })
    });
    assert(clarification.res.status === 200, "clarification request should return 200");
    assert(clarification.payload?.pendingHumanConfirmation === true, "clarification keeps confirmation pending");
    assert(clarification.payload?.clarificationRounds >= 1, "clarification rounds should increase");
    assert(
      clarification.payload?.lastClarificationResolution?.resolvedQuestions?.length >= 0 &&
        clarification.payload?.lastClarificationResolution?.unresolvedQuestions?.length >= 1,
      "clarification should keep unresolved clarification resolution"
    );

    const confirmDenied = await request(`/api/v1/iterations/${createdIterationId}/change-control/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accurate: true,
        actor: "pm",
        note: "try confirm with unresolved questions"
      })
    });
    assert(confirmDenied.res.status === 409, "confirmation should be blocked when clarification questions unresolved");
    assert(Array.isArray(confirmDenied.payload?.unresolvedQuestions) && confirmDenied.payload.unresolvedQuestions.length >= 1, "confirmation block should return unresolved questions");

    const confirmed = await request(`/api/v1/iterations/${createdIterationId}/change-control/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accurate: true,
        actor: "pm",
        note: "confirmed after clarification",
        resolvedClarificationQuestions: pendingChangeControl.clarificationQuestions,
        boundary: {
          requirementRefs: ["REQ-dashboard-kpi"],
          componentRefs: ["dashboard/kpi-card"],
          codePaths: ["apps/web/src/pages/dashboard.tsx"],
          note: "only update dashboard KPI and related api"
        }
      })
    });
    assert(confirmed.res.status === 200, "analysis confirmation should return 200");
    assert(confirmed.payload?.pendingHumanConfirmation === false, "confirmation should unlock publish");
    assert(Array.isArray(confirmed.payload?.clarificationQuestions) && confirmed.payload.clarificationQuestions.length === 0, "confirmation should clear clarification questions");
    assert(Array.isArray(confirmed.payload?.lastClarificationResolution?.unresolvedQuestions) && confirmed.payload.lastClarificationResolution.unresolvedQuestions.length === 0, "confirmation should clear unresolved clarification items");
    assert(Array.isArray(confirmed.payload?.boundary?.componentRefs), "confirmed boundary component refs should exist");

    const updatedBoundary = await request(`/api/v1/iterations/${createdIterationId}/change-control/boundary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requirementRefs: ["REQ-dashboard-kpi", "REQ-dashboard-distribution"],
        componentRefs: ["dashboard/kpi-card", "dashboard/distribution-chart"],
        codePaths: ["apps/web/src/pages/dashboard.tsx", "apps/api/v1/src/dashboard.ts"],
        note: "expanded to distribution chart and api"
      })
    });
    assert(updatedBoundary.res.status === 200, "boundary update should return 200");
    assert(updatedBoundary.payload?.boundary?.codePaths?.length >= 2, "boundary code paths should update");

    const messagesBeforeArtifactCommit = await getJson(`/api/v1/iterations/${createdIterationId}/messages`);
    const analysisDraftSave = await request(`/api/v1/iterations/${createdIterationId}/change-control/artifacts/analysis-report/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor: "pm",
        content: "更新分析报告：补充管理员确认对话路径。"
      })
    });
    assert(analysisDraftSave.res.status === 200, "artifact draft save should return 200");

    const analysisCommit = await request(`/api/v1/iterations/${createdIterationId}/change-control/artifacts/analysis-report/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor: "pm",
        summary: "分析报告已更新并提交",
        source: "contract-test",
        evidence: ["contract-evidence-1"]
      })
    });
    assert(analysisCommit.res.status === 200, "artifact commit should return 200");
    const messagesAfterArtifactCommit = await getJson(`/api/v1/iterations/${createdIterationId}/messages`);
    assert(messagesAfterArtifactCommit.length > messagesBeforeArtifactCommit.length, "artifact commit should append a deliverable reference message");
    const lastArtifactRefMessage = [...messagesAfterArtifactCommit].reverse().find((item) => typeof item?.content === "string" && item.content.includes("【交付物引用】附件分析报告"));
    assert(Boolean(lastArtifactRefMessage), "artifact commit should write deliverable reference card");
    assert(typeof lastArtifactRefMessage?.content === "string" && lastArtifactRefMessage.content.includes("摘要："), "deliverable reference card should include a user-facing summary");

    const blockedArtifactConfirm = await request(`/api/v1/iterations/${createdIterationId}/change-control/artifacts/test-matrix/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor: "qa",
        passed: false,
        note: "发现关键测试未执行，需管理员裁决。"
      })
    });
    assert(blockedArtifactConfirm.res.status === 200, "artifact blocked confirm should return 200");
    const messagesAfterBlockedConfirm = await getJson(`/api/v1/iterations/${createdIterationId}/messages`);
    const adminConfirmRequest = [...messagesAfterBlockedConfirm].reverse().find((item) => typeof item?.content === "string" && item.content.includes("【管理员确认请求】"));
    assert(Boolean(adminConfirmRequest), "blocked artifact confirm should create admin confirmation notification");

    if (Array.isArray(updatedBoundary.payload?.generatedTestMatrix) && updatedBoundary.payload.generatedTestMatrix.length > 0) {
      const firstCase = updatedBoundary.payload.generatedTestMatrix[0];
      const executionUpdate = await request(`/api/v1/iterations/${createdIterationId}/change-control/test-matrix/execution`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          updates: [{ caseId: firstCase.caseId, status: "passed", by: "qa", note: "contract execution" }]
        })
      });
      assert(executionUpdate.res.status === 200, "test matrix execution update should return 200");
      assert(executionUpdate.payload?.summary?.executed >= 1, "test matrix execution should increase executed cases");
      assert(typeof executionUpdate.payload?.summary?.coverage === "number", "test matrix execution should return coverage summary");
    }

    const releaseReview = await request(`/api/v1/iterations/${createdIterationId}/release-review`);
    assert(releaseReview.res.status === 200, "release review should return 200");
    assert(["go", "caution", "block"].includes(releaseReview.payload?.decision), "release review decision must be go/caution/block");
    assert(typeof releaseReview.payload?.score === "number", "release review score should exist");
    assert(Array.isArray(releaseReview.payload?.recommendations), "release review recommendations should exist");

    const testArtifacts = await request(`/api/v1/iterations/${createdIterationId}/change-control/test-artifacts/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true })
    });
    assert(testArtifacts.res.status === 200, "test artifacts generation should return 200");
    assert(Array.isArray(testArtifacts.payload?.generatedFiles), "test artifacts generatedFiles should exist");
    assert(testArtifacts.payload?.generatedFiles?.length >= 1, "test artifacts should include at least one file");

    const fullCycle = await request(`/api/v1/iterations/${createdIterationId}/full-cycle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runAnalysis: false,
        autoConfirmAnalysis: false,
        rewriteInstruction: "仅在边界内完成最小增量改写",
        rewriteDryRun: true,
        generateTestArtifacts: false,
        refreshReleaseReview: true,
        generateDeliveryPackage: true,
        deliveryPackageDryRun: true,
        publish: { enabled: false, dryRun: true }
      })
    });
    assert(fullCycle.res.status === 200, "full-cycle route should return 200");
    assert(["completed", "partial", "blocked", "failed"].includes(fullCycle.payload?.status), "full-cycle status should be valid");
    assert(typeof fullCycle.payload?.steps?.frontendRewrite?.status === "string", "full-cycle frontend rewrite step should exist");
    assert(typeof fullCycle.payload?.steps?.backendRewrite?.status === "string", "full-cycle backend rewrite step should exist");
    assert(typeof fullCycle.payload?.steps?.rewrite?.status === "string", "full-cycle rewrite step should exist");
    assert(typeof fullCycle.payload?.steps?.releaseReview?.status === "string", "full-cycle release-review step should exist");
    assert(typeof fullCycle.payload?.steps?.deliveryPackage?.status === "string", "full-cycle delivery-package step should exist");
    assert(
      typeof fullCycle.payload?.rewriteResult?.summary === "string" &&
        fullCycle.payload.rewriteResult.summary.includes("frontend:") &&
        fullCycle.payload.rewriteResult.summary.includes("backend:"),
      "full-cycle rewrite summary should include frontend/backend lanes"
    );
    assert(Array.isArray(fullCycle.payload?.deliveryPackageResult?.reviewReportFiles), "full-cycle should return delivery review report files");
    assert(Array.isArray(fullCycle.payload?.deliveryPackageResult?.packageFiles), "full-cycle should return delivery package files");
    assert((fullCycle.payload?.deliveryPackageResult?.reviewReportFiles?.length ?? 0) >= 1, "delivery review report files should include at least one item");
    assert((fullCycle.payload?.deliveryPackageResult?.packageFiles?.length ?? 0) >= 1, "delivery package files should include at least one item");

    const publishAfterConfirm = await request(`/api/v1/iterations/${createdIterationId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commitMessage: "chore: publish after confirmation",
        openPr: true,
        dryRun: true
      })
    });
    assert(publishAfterConfirm.res.status === 200 || publishAfterConfirm.res.status === 409, "publish should succeed or be blocked by release gate after confirmation");
    if (publishAfterConfirm.res.status === 409) {
      assert(Array.isArray(publishAfterConfirm.payload?.blockers), "blocked publish should return blockers");
    }
  } else {
    assert(typeof analysisResult.payload?.message === "string", "analysis failure message should exist");
  }

  const invalidIterationId = await request("/api/v1/iterations/abc/context");
  assert(invalidIterationId.res.status === 400, "Invalid iteration id should return 400");

  const stateMachine = await getJson("/api/v1/iterations/1/state-machine");
  assert(typeof stateMachine.currentStatus === "string", "state machine currentStatus must exist");
  assert(Array.isArray(stateMachine.allowedTransitions), "state machine allowedTransitions must be array");
  assert(Array.isArray(stateMachine.transitionHistory), "state machine transitionHistory must be array");

  const invalidTransitionPayload = await request("/api/v1/iterations/1/state/transition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert(invalidTransitionPayload.res.status === 400, "missing toStatus should return 400");

  const currentStatus = stateMachine.currentStatus;
  const allowed = stateMachine.allowedTransitions;
  if (allowed.length > 0) {
    const allStatuses = ["planned", "in-progress", "review", "blocked", "completed"];
    const invalidTarget = allStatuses.find((item) => !allowed.includes(item) && item !== currentStatus);
    if (invalidTarget) {
      const invalidTransition = await request("/api/v1/iterations/1/state/transition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toStatus: invalidTarget, reason: "manual transition for contract test" })
      });
      assert(invalidTransition.res.status === 409, "invalid transition should return 409");
    }

    const validTarget = allowed[0];
    const validTransition = await request("/api/v1/iterations/1/state/transition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toStatus: validTarget, reason: "contract test transition reason" })
    });
    assert(validTransition.res.status === 200, "valid transition should return 200");
    assert(validTransition.payload?.toStatus === validTarget, "transition target status mismatch");
    assert(validTransition.payload?.source === "manual", "transition source should be manual");
  }

  const auditAfterTransition = await getJson("/api/v1/governance/audit-logs?limit=80");
  assert(Array.isArray(auditAfterTransition), "audit logs should be array");
}
