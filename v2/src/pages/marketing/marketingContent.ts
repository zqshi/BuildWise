export type MarketingStat = {
  value: string;
  label: string;
};

export type MarketingContrast = {
  title: string;
  detail: string;
};

export type MarketingFeature = {
  icon: string;
  title: string;
  summary: string;
};

export type MarketingJourney = {
  index: string;
  title: string;
  subtitle: string;
  summary: string;
  details: string[];
};

export const marketingHeroStats: MarketingStat[] = [
  { value: "15", label: "AI 专业技能自动编排" },
  { value: "7 阶段", label: "交付物全生命周期管理" },
  { value: "go / block", label: "基于证据的发布决策" }
];

export const marketingProblems: MarketingContrast[] = [
  {
    title: "需求改了，不知道影响了什么",
    detail: "改一个字段，要挨个问研发\u201C哪些页面和接口会受影响\u201D，没人说得清。"
  },
  {
    title: "上线前问\u201C能发吗\u201D，没人敢拍板",
    detail: "测试覆盖不清楚，回滚方案没人写，发布决策靠胆量。"
  },
  {
    title: "每次迭代都像从零开始",
    detail: "上轮做了什么决策、踩了什么坑、统一了什么术语——全靠口口相传。"
  }
];

export const marketingSolutions: MarketingContrast[] = [
  {
    title: "上传文档，AI 告诉你影响范围",
    detail: "需求到功能模块到代码的完整追溯链，变更影响一目了然。"
  },
  {
    title: "测试矩阵 + 发布门禁，用数据说话",
    detail: "自动生成测试用例，逐条确认。go / caution / block 三档发布决策。"
  },
  {
    title: "项目越做越聪明",
    detail: "每次迭代自动沉淀术语、规则、决策和风险，下次分析更精准。"
  }
];

export const marketingFeatures: MarketingFeature[] = [
  {
    icon: "◉",
    title: "上传即分析",
    summary: "拖入 PRD、原型、截图，AI 自动产出结构化分析报告和澄清问题。"
  },
  {
    icon: "◌",
    title: "对话式引导",
    summary: "AI 教练全程伴随，像跟懂技术的项目经理聊天一样推进迭代。"
  },
  {
    icon: "△",
    title: "变更追溯",
    summary: "需求变了，立刻看到影响了哪些业务流程、功能模块和代码路径。"
  },
  {
    icon: "▣",
    title: "发布门禁",
    summary: "测试覆盖率、阻塞项、回滚方案——发布决策不再靠拍脑袋。"
  }
];

export const marketingJourney: MarketingJourney[] = [
  {
    index: "01",
    title: "上传",
    subtitle: "把需求扔进来",
    summary: "不管是 Word、PDF、Figma 截图还是口头描述，直接丢给 AI。",
    details: [
      "拖拽上传或在聊天窗口粘贴",
      "AI 自动识别项目类型和业务领域",
      "产出高优先级发现和澄清问题"
    ]
  },
  {
    index: "02",
    title: "确认",
    subtitle: "人机协同对齐理解",
    summary: "AI 分析完，你来确认：理解对不对、边界在哪里、什么不做。",
    details: [
      "回答 AI 提出的澄清问题",
      "声明变更边界和验收标准",
      "确认分析准确后进入下一步"
    ]
  },
  {
    index: "03",
    title: "交付",
    subtitle: "从生成到发布的完整闭环",
    summary: "AI 自动生成交付物，你逐个确认。测试矩阵 + 发布评审保障质量。",
    details: [
      "PRD、设计、代码、测试用例自动生成",
      "每个交付物有草稿→提交→确认的评审流程",
      "发布评审：go / caution / block 决策"
    ]
  }
];
