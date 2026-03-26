#!/usr/bin/env node

/**
 * BuildWise E2E 双迭代验证脚本
 * API 驱动，真实调用 DeepSeek LLM，数据落 SQLite
 * 无 mock、无兜底、无结构化硬编码
 */

const BASE = process.env.E2E_API_BASE || "http://127.0.0.1:5055";
const ROLE = "owner";
const USER_ID = "e2e-user";
const HEADERS = {
  "content-type": "application/json",
  "x-role": ROLE,
  "x-user-id": USER_ID,
};

function log(stage, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] [${stage}] ${msg}\n`);
}

async function api(path, options = {}) {
  const url = `${BASE}/api/v1${path}`;
  const timeoutMs = options.timeoutMs || 300_000; // 5 分钟默认超时
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: HEADERS,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = text; }
    if (!res.ok && options.allowFail !== true) {
      throw new Error(`${options.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }
    return { status: res.status, ok: res.ok, payload };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * 提交异步分析任务并轮询等待完成
 */
async function submitAndWaitAnalysis(iterationId, body) {
  // 1. 提交异步分析任务
  const submit = await api(`/iterations/${iterationId}/analysis/jobs`, {
    method: "POST",
    body,
    timeoutMs: 30_000,
  });
  assert(submit.status === 202 || submit.status === 200, `分析提交失败: ${submit.status}`);
  const jobId = submit.payload.jobId || submit.payload.id;
  log("Analysis", `任务提交成功: jobId=${jobId}`);

  // 2. 轮询等待完成 (最多 10 分钟)
  const deadline = Date.now() + 600_000;
  let lastStatus = "";
  while (Date.now() < deadline) {
    await sleep(5_000);
    const poll = await api(`/iterations/${iterationId}/analysis/jobs/${jobId}`, {
      allowFail: true,
      timeoutMs: 15_000,
    });
    if (!poll.ok) {
      // 如果轮询接口不存在，改用分析报告接口检查
      const report = await api(`/iterations/${iterationId}/analysis-report`, {
        allowFail: true,
        timeoutMs: 15_000,
      });
      if (report.ok && report.payload?.report) {
        log("Analysis", "分析报告已生成（通过 report 接口确认）");
        return report;
      }
      // 等待并继续
      await sleep(5_000);
      continue;
    }
    const status = poll.payload.status || poll.payload.state;
    if (status !== lastStatus) {
      log("Analysis", `任务状态: ${status}`);
      lastStatus = status;
    }
    if (status === "succeeded" || status === "partial_succeeded" || status === "completed" || status === "done") {
      log("Analysis", `分析任务完成: ${status}`);
      return poll;
    }
    if (status === "failed" || status === "error") {
      throw new Error(`分析任务失败: ${JSON.stringify(poll.payload).slice(0, 500)}`);
    }
  }
  throw new Error("分析任务超时（10分钟）");
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

// ─────────────────────────────────────────────
// Stage 1: 创建项目
// ─────────────────────────────────────────────
async function stage1_createProject() {
  log("S1", "创建项目: 创意生成器");
  const res = await api("/projects", {
    method: "POST",
    body: {
      name: "创意生成器",
      description: "基于AI的多场景创意内容自动生成平台，支持营销文案、标题、广告语的智能生成与优化",
    },
  });
  assert(Number.isInteger(res.payload.id), "项目 ID 缺失");
  log("S1", `项目创建成功 id=${res.payload.id}`);
  return res.payload.id;
}

// ─────────────────────────────────────────────
// Stage 2: 第一次迭代 v0.1.0
// ─────────────────────────────────────────────
async function stage2_iterationV1(projectId) {
  log("S2", "创建迭代: v0.1.0 创意生成 MVP");
  const iter = await api(`/projects/${projectId}/iterations`, {
    method: "POST",
    body: {
      name: "v0.1.0 创意生成 MVP",
      description: "实现基础的营销文案生成功能，支持三种风格输出",
      versionType: "minor",
      goals: ["实现基础文案生成能力"],
      scope: {
        inScope: ["主题关键词输入", "三种风格文案生成（正式/活泼/专业）", "结果展示页面"],
        outOfScope: ["用户注册登录", "文案历史管理", "批量生成"],
        acceptanceCriteria: ["3秒内返回3种风格文案", "风格区分明显", "内容与主题相关"],
      },
    },
  });
  const iterationId = iter.payload.id;
  assert(Number.isInteger(iterationId), "迭代 ID 缺失");
  log("S2", `迭代创建成功 id=${iterationId}`);

  // 推进状态: planned → in-progress
  log("S2", "推进状态: planned → in-progress");
  await api(`/iterations/${iterationId}/state/transition`, {
    method: "POST",
    body: { toStatus: "in-progress", reason: "开始执行第一个迭代，进入开发阶段" },
  });

  // Coach 对话 1: 发送需求
  log("S2", "Coach 对话: 发送需求描述 (真实调用 DeepSeek LLM)...");
  const chat1 = await api(`/iterations/${iterationId}/agent-chat`, {
    method: "POST",
    body: {
      message: "我需要开发一个创意内容生成器的MVP版本。核心功能：用户输入一个主题关键词（如春节促销），AI自动生成3种风格的营销文案——正式商务风、活泼社交风、专业技术风，每种50-200字。技术栈使用React前端+Node后端+DeepSeek API。验收标准：输入关键词后3秒内返回3种风格文案，内容与主题相关且风格区分明显。",
    },
    timeoutMs: 120_000,
  });
  log("S2", `Coach 回复: ${(chat1.payload.reply || "").slice(0, 200)}...`);
  log("S2", `LLM: model=${chat1.payload.llm?.model}, used=${chat1.payload.llm?.used}`);

  // 分析附件（异步提交 + 轮询，真实 LLM 分析）
  log("S2", "提交需求分析 (异步任务 + 真实 LLM 调用)...");
  const analysis = await submitAndWaitAnalysis(iterationId, {
      fileName: "creative-generator-mvp-requirement.md",
      mimeType: "text/markdown",
      size: 4200,
      sourceType: "single-file",
      excerpt: [
        "# 创意内容生成器 MVP 需求规格说明书",
        "",
        "## 1. 项目概述",
        "### 1.1 项目背景",
        "企业营销团队日常需要为不同渠道（公众号、朋友圈、邮件、官网）撰写大量营销文案。手工撰写效率低、风格不统一。本项目旨在利用AI大语言模型，实现主题关键词到多风格营销文案的自动生成。",
        "### 1.2 目标用户",
        "- 市场营销人员：日常需要快速产出多风格文案",
        "- 运营人员：需要为活动页、推广海报撰写标题和描述",
        "- 内容创作者：需要灵感参考和初稿生成",
        "",
        "## 2. 核心功能需求",
        "### 2.1 主题关键词输入",
        "- 用户在输入框中填写1-5个关键词（如：春节促销、新品发布、年终总结）",
        "- 支持中英文关键词混合输入",
        "- 输入字符数限制：2-100字",
        "- 输入校验：非空、去除首尾空白、过滤特殊字符",
        "",
        "### 2.2 三种风格文案生成",
        "系统根据输入关键词，调用DeepSeek LLM生成三种不同风格的营销文案：",
        "| 风格 | 特征描述 | 适用场景 | 字数范围 |",
        "|------|---------|---------|---------|",
        "| 正式商务风 | 用词严谨、数据导向、权威感强 | B2B邮件、官方公告、行业报告 | 100-200字 |",
        "| 活泼社交风 | 语气轻松、善用emoji、口语化 | 朋友圈、微博、小红书 | 50-150字 |",
        "| 专业技术风 | 术语精准、逻辑清晰、方案导向 | 技术博客、产品文档、白皮书 | 80-200字 |",
        "",
        "### 2.3 结果展示",
        "- 三种风格文案卡片式展示，每张卡片包含：风格标签、文案标题、文案正文",
        "- 支持一键复制单条文案到剪贴板",
        "- 支持\"重新生成\"按钮，保持关键词不变重新调用LLM",
        "",
        "## 3. 技术架构设计",
        "### 3.1 前端",
        "- 技术栈：React 18 + TailwindCSS + Vite",
        "- 页面结构：单页应用，输入区域在上，结果卡片在下",
        "- 状态管理：React useState，无需全局状态",
        "- HTTP请求：fetch API调用后端RESTful接口",
        "",
        "### 3.2 后端",
        "- 技术栈：Node.js 20 + Express",
        "- API设计：POST /api/generate，请求体{keywords: string}，返回{results: [{style, title, content}]}",
        "- AI引擎：DeepSeek API (deepseek-chat模型)，OpenAI兼容接口",
        "- Prompt工程：为每种风格设计独立的system prompt，确保风格差异化",
        "- 错误处理：LLM超时返回友好提示，重试机制（最多2次）",
        "",
        "### 3.3 部署",
        "- 开发环境：前端Vite dev server (5173)，后端Express (3000)",
        "- 生产环境：前端静态文件由Nginx托管，后端PM2管理",
        "",
        "## 4. 验收标准",
        "### 4.1 功能验收",
        "- AC-1：输入任意中文关键词，3秒内返回3种风格文案",
        "- AC-2：三种风格文案在措辞、语气、结构上有明显差异",
        "- AC-3：生成内容与输入主题高度相关，无跑题现象",
        "- AC-4：一键复制功能正常，复制后有视觉反馈",
        "- AC-5：重新生成得到不同内容（非缓存结果）",
        "",
        "### 4.2 非功能验收",
        "- NFR-1：首次加载时间<2秒（Lighthouse评分>80）",
        "- NFR-2：LLM调用P95延迟<5秒",
        "- NFR-3：支持Chrome/Firefox/Safari最新两个版本",
        "",
        "## 5. 范围约束",
        "### 5.1 本版本范围内",
        "- 主题关键词输入与校验",
        "- 三种预设风格文案生成",
        "- 结果卡片展示与复制",
        "- 基础错误提示与loading状态",
        "",
        "### 5.2 本版本范围外（后续迭代）",
        "- 用户注册/登录系统",
        "- 文案历史记录与管理",
        "- 批量生成模式",
        "- 自定义风格模板",
        "- 文案编辑与二次修改",
        "- 多语言支持",
        "",
        "## 6. 风险与依赖",
        "- 风险：DeepSeek API可用性和响应速度受网络影响",
        "- 缓解：设置超时(5s)和重试(2次)，失败时展示友好提示",
        "- 依赖：DeepSeek API Key有效且有足够额度",
      ].join("\n"),
      agentScope: "full-cycle",
      autoTransition: false,
  });
  log("S2", `分析完成: status=${analysis.status}`);
  if (analysis.payload?.clarificationQuestions?.length) {
    log("S2", `澄清问题: ${analysis.payload.clarificationQuestions.length} 个`);
  }

  // 确认分析
  log("S2", "确认分析准确性...");
  await api(`/iterations/${iterationId}/change-control/confirm`, {
    method: "POST",
    body: {
      accurate: true,
      force: true,
      note: "需求分析准确，确认推进",
      actor: USER_ID,
      boundary: {
        requirementRefs: ["主题关键词输入", "三风格文案生成", "结果展示"],
        componentRefs: ["InputPage", "GeneratorService", "ResultDisplay"],
        codePaths: ["src/pages/generator", "src/services/ai", "src/components/result"],
        note: "v0.1.0 变更边界锁定",
      },
    },
  });
  log("S2", "分析确认完成");

  // Coach 对话 2: 推进
  log("S2", "Coach 对话: 推进边界和代码方案...");
  const chat2 = await api(`/iterations/${iterationId}/agent-chat`, {
    method: "POST",
    body: { message: "分析确认完毕，请帮我推进变更边界锁定，然后生成代码改写方案和测试用例。" },
    timeoutMs: 120_000,
  });
  log("S2", `Coach 回复: ${(chat2.payload.reply || "").slice(0, 200)}...`);

  // Coach 对话 3: 发布评审
  log("S2", "Coach 对话: 请求发布评审...");
  const chat3 = await api(`/iterations/${iterationId}/agent-chat`, {
    method: "POST",
    body: { message: "请完成发布评审，确认当前迭代是否具备发布条件。" },
    timeoutMs: 120_000,
  });
  log("S2", `Coach 回复: ${(chat3.payload.reply || "").slice(0, 200)}...`);

  // 推进状态: in-progress → review → completed
  log("S2", "推进状态: in-progress → review");
  await api(`/iterations/${iterationId}/state/transition`, {
    method: "POST",
    body: { toStatus: "review", reason: "v0.1.0 开发完成，进入代码评审和发布评审阶段" },
  });

  log("S2", "推进状态: review → completed");
  await api(`/iterations/${iterationId}/state/transition`, {
    method: "POST",
    body: { toStatus: "completed", reason: "v0.1.0 迭代评审通过，所有交付物确认完成" },
  });

  log("S2", "✅ 第一次迭代完成");
  return iterationId;
}

// ─────────────────────────────────────────────
// Stage 3: 第二次迭代 v0.2.0
// ─────────────────────────────────────────────
async function stage3_iterationV2(projectId) {
  log("S3", "创建迭代: v0.2.0 多模态与模板");
  const iter = await api(`/projects/${projectId}/iterations`, {
    method: "POST",
    body: {
      name: "v0.2.0 多模态与模板",
      description: "在MVP基础上增加行业模板、批量生成和质量评分功能",
      versionType: "minor",
      goals: ["支持行业模板和批量生成", "增加文案质量评分"],
      scope: {
        inScope: ["10个行业模板", "批量生成模式", "质量评分机制", "生成速度优化"],
        outOfScope: ["图文混排", "实时协作", "移动端适配"],
        acceptanceCriteria: ["行业模板覆盖10个行业", "批量一次生成5条", "评分三维度1-10分", "单次生成<3秒"],
      },
    },
  });
  const iterationId = iter.payload.id;
  log("S3", `迭代创建成功 id=${iterationId}`);

  // planned → in-progress
  log("S3", "推进状态: planned → in-progress");
  await api(`/iterations/${iterationId}/state/transition`, {
    method: "POST",
    body: { toStatus: "in-progress", reason: "开始执行v0.2.0迭代，进入增量开发阶段" },
  });

  // Coach 对话: 发送增量需求
  log("S3", "Coach 对话: 发送增量需求 (真实 LLM 调用)...");
  const chat1 = await api(`/iterations/${iterationId}/agent-chat`, {
    method: "POST",
    body: {
      message: "在v0.1.0的基础上，本次迭代需要增加以下功能：1)预设10个行业模板（电商、教育、医疗、金融、餐饮、旅游、科技、地产、汽车、美妆），每个模板包含行业特定的文案风格和关键词建议；2)支持批量生成模式，用户一次输入可生成5条不同角度的文案；3)增加文案质量评分机制，AI自动从创意性、相关性、可读性三个维度评估并给出1-10分及优化建议；4)优化生成速度，目标单次生成<3秒。非功能需求：结果导出PDF，文案历史记录保留30天。",
    },
    timeoutMs: 120_000,
  });
  log("S3", `Coach 回复: ${(chat1.payload.reply || "").slice(0, 200)}...`);
  log("S3", `LLM: model=${chat1.payload.llm?.model}, used=${chat1.payload.llm?.used}`);

  // 分析
  log("S3", "提交需求分析 (异步任务 + 真实 LLM 调用)...");
  const analysis = await submitAndWaitAnalysis(iterationId, {
      fileName: "creative-generator-v2-requirement.md",
      mimeType: "text/markdown",
      size: 5600,
      sourceType: "single-file",
      excerpt: [
        "# 创意生成器 v0.2.0 增量需求规格说明书",
        "",
        "## 1. 版本基线",
        "### v0.1.0 已实现能力",
        "- 主题关键词输入（2-100字中英文）",
        "- 三种风格文案生成（正式商务风、活泼社交风、专业技术风）",
        "- 结果卡片展示与一键复制",
        "- 基础错误处理与loading状态",
        "",
        "## 2. 新增功能需求",
        "",
        "### 2.1 行业模板系统",
        "#### 功能描述",
        "预设10个行业模板，用户选择行业后，系统自动注入行业特定的关键词、语气和文案结构。",
        "",
        "#### 行业模板清单",
        "| 编号 | 行业 | 关键词示例 | 推荐语气 | 文案结构 |",
        "|------|------|-----------|---------|---------|",
        "| T01 | 电商 | 限时折扣、爆款、秒杀 | 紧迫感+利益驱动 | 标题+卖点+行动号召 |",
        "| T02 | 教育 | 提分、名师、课程 | 权威+关怀 | 痛点+解决方案+案例 |",
        "| T03 | 医疗 | 专家、微创、康复 | 专业+信任 | 症状+方案+资质背书 |",
        "| T04 | 金融 | 收益、稳健、合规 | 稳重+数据支撑 | 市场分析+产品优势+风险提示 |",
        "| T05 | 餐饮 | 新鲜、招牌、限定 | 活泼+感官描写 | 场景描绘+菜品特色+优惠信息 |",
        "| T06 | 旅游 | 自由行、打卡、深度游 | 向往+共鸣 | 目的地亮点+行程特色+价格优势 |",
        "| T07 | 科技 | 创新、智能、效率 | 前沿+专业 | 技术突破+应用场景+性能数据 |",
        "| T08 | 地产 | 学区、地铁、品质 | 稳重+生活方式 | 区位优势+户型亮点+配套资源 |",
        "| T09 | 汽车 | 操控、安全、续航 | 激情+可靠 | 性能参数+驾驶体验+对比优势 |",
        "| T10 | 美妆 | 水润、抗老、成分 | 亲切+专业 | 肤质痛点+成分解析+使用效果 |",
        "",
        "#### 交互设计",
        "- 输入区域上方新增行业选择下拉框（可选，不选则通用模式）",
        "- 选择行业后自动填充推荐关键词（用户可修改）",
        "- 模板数据前端静态JSON配置，无需后台管理接口",
        "",
        "### 2.2 批量生成模式",
        "#### 功能描述",
        "用户一次输入，系统从5个不同角度自动生成文案变体。",
        "",
        "#### 角度分化策略",
        "| 角度编号 | 名称 | 描述 |",
        "|---------|------|------|",
        "| A1 | 功能价值角度 | 突出产品/服务的功能特性和实用价值 |",
        "| A2 | 情感共鸣角度 | 引发用户情感共鸣，讲述故事或描绘场景 |",
        "| A3 | 数据证言角度 | 用数字、案例、第三方背书增强说服力 |",
        "| A4 | 对比差异角度 | 通过与竞品/旧方案对比突出优势 |",
        "| A5 | 紧迫行动角度 | 制造时间/数量紧迫感，推动立即行动 |",
        "",
        "#### 接口设计",
        "- POST /api/generate 新增参数 mode: 'single' | 'batch'",
        "- batch模式返回 {results: [{angle, style, title, content}]} 共15条（5角度×3风格）",
        "- 后端并发调用LLM（Promise.all），单次总响应<3秒",
        "",
        "### 2.3 文案质量评分机制",
        "#### 功能描述",
        "AI自动对每条生成文案进行三维度评估。",
        "",
        "#### 评分维度",
        "| 维度 | 评分范围 | 评估标准 |",
        "|------|---------|---------|",
        "| 创意性 | 1-10分 | 用词新颖度、表达独特性、是否有记忆点 |",
        "| 相关性 | 1-10分 | 与输入关键词的语义匹配度、行业契合度 |",
        "| 可读性 | 1-10分 | 句子流畅度、段落结构、目标受众理解难度 |",
        "",
        "#### 展示方式",
        "- 每条文案卡片底部显示三维度分数（雷达图或进度条）",
        "- 总分 = (创意性 + 相关性 + 可读性) / 3，保留一位小数",
        "- 低于6分的维度标红并给出一句优化建议",
        "",
        "### 2.4 性能优化",
        "- 批量模式：5个角度并发调用LLM（Promise.all）",
        "- 单次模式：3种风格并发调用",
        "- 目标：单次生成端到端延迟P95<3秒",
        "- 流式渲染：支持LLM streaming，文案逐字显示",
        "",
        "## 3. 非功能需求",
        "### 3.1 结果导出PDF",
        "- 用户点击\"导出PDF\"按钮，将当前所有文案导出为格式化PDF",
        "- PDF包含：项目名称、生成时间、关键词、每条文案及其评分",
        "- 使用 jsPDF 或 html2pdf.js 前端生成",
        "",
        "### 3.2 文案历史记录",
        "- 自动保存每次生成记录到 localStorage",
        "- 历史列表按时间倒序展示，显示关键词和生成时间",
        "- 点击历史记录可查看完整文案",
        "- 保留30天，超期自动清理",
        "",
        "## 4. 验收标准",
        "- AC-1：选择行业模板后自动填充推荐关键词",
        "- AC-2：批量模式一次生成15条文案（5角度×3风格）",
        "- AC-3：每条文案显示三维度评分且总分合理",
        "- AC-4：低分维度有优化建议提示",
        "- AC-5：批量生成端到端延迟<3秒",
        "- AC-6：PDF导出内容完整、格式美观",
        "- AC-7：历史记录正常保存和查看",
        "",
        "## 5. 约束与兼容",
        "- 保持与v0.1.0的API向后兼容（mode参数可选，默认single）",
        "- 模板数据前端静态配置（templates.json），不增加后端接口",
        "- 不涉及：图文混排、实时多人协作、移动端专项适配",
      ].join("\n"),
      agentScope: "full-cycle",
      autoTransition: false,
  });
  log("S3", `分析完成: status=${analysis.status}`);

  // 确认
  log("S3", "确认分析...");
  await api(`/iterations/${iterationId}/change-control/confirm`, {
    method: "POST",
    body: {
      accurate: true,
      force: true,
      note: "v0.2.0 增量分析确认",
      actor: USER_ID,
      boundary: {
        requirementRefs: ["行业模板系统", "批量生成", "质量评分", "性能优化", "PDF导出"],
        componentRefs: ["TemplateSelector", "BatchGenerator", "QualityScorer", "PDFExporter"],
        codePaths: ["src/templates", "src/services/batch", "src/services/scoring", "src/utils/export"],
        note: "v0.2.0 变更边界",
      },
    },
  });

  // Coach 对话 2
  log("S3", "Coach 对话: 推进代码和测试...");
  const chat2 = await api(`/iterations/${iterationId}/agent-chat`, {
    method: "POST",
    body: { message: "分析确认完毕。请推进代码改写方案，生成测试用例，并完成发布评审。注意继承v0.1.0的基线能力。" },
    timeoutMs: 120_000,
  });
  log("S3", `Coach 回复: ${(chat2.payload.reply || "").slice(0, 200)}...`);

  // 状态推进
  log("S3", "推进状态: in-progress → review → completed");
  await api(`/iterations/${iterationId}/state/transition`, {
    method: "POST",
    body: { toStatus: "review", reason: "v0.2.0 开发完成，进入代码评审和发布评审阶段" },
  });
  await api(`/iterations/${iterationId}/state/transition`, {
    method: "POST",
    body: { toStatus: "completed", reason: "v0.2.0 迭代评审通过，所有交付物确认完成" },
  });

  log("S3", "✅ 第二次迭代完成");
  return iterationId;
}

// ─────────────────────────────────────────────
// Stage 4: 验证数据完整性
// ─────────────────────────────────────────────
async function stage4_verify(projectId, iter1Id, iter2Id) {
  log("S4", "验证数据完整性...");

  // 项目
  const projects = await api("/projects");
  const project = projects.payload.find(p => p.name === "创意生成器");
  assert(project, "项目 '创意生成器' 不存在");
  log("S4", `项目: id=${project.id}, name=${project.name}`);

  // 迭代列表
  const iters = await api(`/projects/${projectId}/iterations`);
  assert(iters.payload.length >= 2, `迭代数量不足: ${iters.payload.length}`);
  log("S4", `迭代数量: ${iters.payload.length}`);
  for (const it of iters.payload) {
    log("S4", `  - ${it.name} [${it.status}]`);
  }

  // 迭代 1 消息
  const msgs1 = await api(`/iterations/${iter1Id}/messages`);
  log("S4", `v0.1.0 消息数: ${msgs1.payload.length}`);
  assert(msgs1.payload.length >= 3, `v0.1.0 消息不足: ${msgs1.payload.length}`);

  // 迭代 1 变更控制
  const cc1 = await api(`/iterations/${iter1Id}/change-control`);
  log("S4", `v0.1.0 变更控制: confirmed=${cc1.payload.analysisConfirmed}`);

  // 迭代 2 消息
  const msgs2 = await api(`/iterations/${iter2Id}/messages`);
  log("S4", `v0.2.0 消息数: ${msgs2.payload.length}`);
  assert(msgs2.payload.length >= 3, `v0.2.0 消息不足: ${msgs2.payload.length}`);

  // 迭代 2 变更控制
  const cc2 = await api(`/iterations/${iter2Id}/change-control`);
  log("S4", `v0.2.0 变更控制: confirmed=${cc2.payload.analysisConfirmed}`);

  // 迭代 1 上下文
  const ctx1 = await api(`/iterations/${iter1Id}/context`);
  log("S4", `v0.1.0 上下文: status=${ctx1.payload.iteration?.status}`);

  // 迭代 2 上下文
  const ctx2 = await api(`/iterations/${iter2Id}/context`);
  log("S4", `v0.2.0 上下文: status=${ctx2.payload.iteration?.status}`);

  // 审计日志
  const audit = await api("/governance/audit-logs");
  log("S4", `审计日志: ${audit.payload.length} 条`);

  log("S4", "✅ 数据验证通过");
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
async function main() {
  log("Main", "═".repeat(60));
  log("Main", "BuildWise E2E 双迭代验证");
  log("Main", `API: ${BASE}`);
  log("Main", "LLM: DeepSeek (真实调用，无 mock)");
  log("Main", "═".repeat(60));

  const projectId = await stage1_createProject();
  const iter1Id = await stage2_iterationV1(projectId);
  const iter2Id = await stage3_iterationV2(projectId);
  await stage4_verify(projectId, iter1Id, iter2Id);

  log("Main", "═".repeat(60));
  log("Main", "✅ 全部 E2E 验证通过");
  log("Main", `项目 ID: ${projectId}`);
  log("Main", `迭代 v0.1.0 ID: ${iter1Id}`);
  log("Main", `迭代 v0.2.0 ID: ${iter2Id}`);
  log("Main", `打开 http://localhost:5173/#/workspace 查看数据`);
  log("Main", "═".repeat(60));
}

main().catch((err) => {
  log("FATAL", err.message);
  process.exit(1);
});
