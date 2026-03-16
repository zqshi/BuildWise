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
  { value: "10x", label: "需求到交付效率" },
  { value: "1", label: "统一项目模型" },
  { value: "Full-stack", label: "源码资产输出" }
];

export const marketingProblems: MarketingContrast[] = [
  {
    title: "需求层层转述",
    detail: "业务意图在产品、设计、研发之间持续失真。"
  },
  {
    title: "生成结果不可控",
    detail: "只有速度，没有模型约束和治理闭环。"
  },
  {
    title: "变更一来就返工",
    detail: "很难知道该改哪里，会影响什么。"
  }
];

export const marketingSolutions: MarketingContrast[] = [
  {
    title: "先编译成模型",
    detail: "把意图沉淀为统一项目模型。"
  },
  {
    title: "再驱动全栈资产",
    detail: "页面、接口、规则同步生成与演进。"
  },
  {
    title: "最后进入治理闭环",
    detail: "影响分析、验证、回滚天然存在。"
  }
];

export const marketingFeatures: MarketingFeature[] = [
  {
    icon: "◉",
    title: "多源输入",
    summary: "语言、草图、设计稿统一进入系统。"
  },
  {
    icon: "◌",
    title: "模型驱动",
    summary: "围绕单一事实来源组织页面、接口与规则。"
  },
  {
    icon: "△",
    title: "变更同步",
    summary: "需求变化后可以识别影响并增量修正。"
  },
  {
    icon: "▣",
    title: "治理交付",
    summary: "质量门禁、快照恢复与发布依据一体化。"
  }
];

export const marketingJourney: MarketingJourney[] = [
  {
    index: "01",
    title: "Capture",
    subtitle: "理解业务意图",
    summary: "把目标、范围、规则与例外先对齐成可以被系统识别的表达。",
    details: ["语言、草图、设计稿统一进入", "保留业务上下文与约束条件", "把模糊需求转成结构化描述"]
  },
  {
    index: "02",
    title: "Compile",
    subtitle: "沉淀统一模型",
    summary: "将页面、数据、接口与业务规则编译为同一套项目模型。",
    details: ["围绕单一事实来源组织资产", "让页面与接口关系同步显性化", "为后续生成和变更提供蓝图"]
  },
  {
    index: "03",
    title: "Deliver",
    subtitle: "进入交付治理",
    summary: "把生成、验证、发布、快照和回滚纳入持续可控的交付闭环。",
    details: ["识别影响范围并增量修正", "保留验证依据和发布边界", "让迭代、回滚与治理同频发生"]
  }
];
