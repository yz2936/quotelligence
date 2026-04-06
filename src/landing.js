const dictionary = {
  en: {
    signIn: "Sign In",
    openApp: "Open Workspace",
    eyebrow: "Purpose-Built For Industrial Quoting Teams",
    heroTitle: "From RFQ intake to approval-ready quote package in one workflow",
    heroBody:
      "Quotelligence combines document parsing, case orchestration, pricing support, and follow-up execution so your team can quote faster with stronger controls.",
    startNow: "Start Now",
    seeFlow: "See Workflow",
    metric1: "Unified workspace across intake, case, quote, and negotiation",
    metric2: "Core operating modules designed for sales execution",
    metric3: "Traceable actions with history, statuses, and follow-up records",
    workflowTitle: "How the workflow runs",
    workflow1: "Intake RFQs from chat, uploads, or synced inbox and auto-create structured cases.",
    workflow2: "Review case details, knowledge matches, risks, and clarifications before quoting.",
    workflow3: "Generate quote drafts, formal email + PDF package, and negotiation follow-up actions.",
    featureTitle: "Core modules",
    feature1Title: "Chat Intake + Email Intake",
    feature1Body: "Capture requirements from uploaded files and forwarded inbox messages with parsing visibility.",
    feature2Title: "Case Workshop",
    feature2Body: "Normalize RFQ details, maintain checkpoints, and preserve per-case history for decisions.",
    feature3Title: "Quote Builder",
    feature3Body: "Build line-level quote drafts, override unmatched lines, and keep historical snapshots.",
    feature4Title: "Negotiation Center",
    feature4Body: "Track pending deals, log sent actions, and schedule or execute follow-up emails.",
    feature5Title: "Customer Complaints",
    feature5Body: "Store complaint emails/documents, extract full EML context, and run analyst-assisted review.",
    feature6Title: "Knowledge Base + Analyst",
    feature6Body: "Upload PDFs/Excel references, query scoped datasets, and retain analysis trace per question.",
    ctaTitle: "Ready to run your next RFQ walkthrough?",
    ctaBody: "Open the product workspace, sign in, and start with chat intake or inbox sync.",
    ctaButton: "Launch Quotelligence",
  },
  zh: {
    signIn: "登录",
    openApp: "进入工作台",
    eyebrow: "为工业报价团队打造",
    heroTitle: "从 RFQ 收集到可审批报价包，一条完整流程",
    heroBody: "Quotelligence 将文档解析、案件编排、报价支持和跟进执行整合到同一系统，帮助团队更快报价并保持流程可控。",
    startNow: "立即开始",
    seeFlow: "查看流程",
    metric1: "收集、案件、报价、谈判一体化工作台",
    metric2: "6 个核心模块支撑销售报价执行",
    metric3: "100% 可追溯记录：状态、动作、跟进历史",
    workflowTitle: "核心流程",
    workflow1: "通过聊天、文件上传或邮箱同步接收 RFQ，并自动生成结构化案件。",
    workflow2: "在报价前审阅案件详情、知识库匹配、风险与澄清点。",
    workflow3: "生成草稿报价、正式邮件与 PDF 报价包，并执行谈判跟进。",
    featureTitle: "核心功能模块",
    feature1Title: "聊天收集 + 邮箱收集",
    feature1Body: "解析上传文件和转发邮件，并展示解析过程与结果。",
    feature2Title: "案件工作坊",
    feature2Body: "标准化 RFQ 信息，维护关键检查点，保留完整决策历史。",
    feature3Title: "报价构建器",
    feature3Body: "支持逐行报价、无匹配品项覆盖、以及历史草稿切换。",
    feature4Title: "谈判中心",
    feature4Body: "跟踪待回复报价、记录已发送动作、安排或执行跟进邮件。",
    feature5Title: "客户投诉中心",
    feature5Body: "沉淀投诉邮件与附件，完整解析 EML，上下文可追溯。",
    feature6Title: "知识库 + 分析助手",
    feature6Body: "上传 PDF/Excel 资料，按数据源筛选提问并保留分析轨迹。",
    ctaTitle: "准备好演示下一次 RFQ 流程了吗？",
    ctaBody: "进入产品工作台，登录后可从聊天收集或邮箱同步开始。",
    ctaButton: "启动 Quotelligence",
  },
};

const languageButtons = Array.from(document.querySelectorAll("[data-lang]"));
const translatable = Array.from(document.querySelectorAll("[data-i18n]"));
const STORAGE_KEY = "quotelligence_landing_lang";
const preferredLanguage = window.localStorage?.getItem(STORAGE_KEY) === "zh" ? "zh" : "en";

function setLanguage(language) {
  const content = dictionary[language] || dictionary.en;

  for (const element of translatable) {
    const key = element.getAttribute("data-i18n");
    if (!key) {
      continue;
    }

    const value = content[key];
    if (typeof value === "string") {
      element.textContent = value;
    }
  }

  for (const button of languageButtons) {
    button.classList.toggle("is-active", button.getAttribute("data-lang") === language);
  }

  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  window.localStorage?.setItem(STORAGE_KEY, language);
}

for (const button of languageButtons) {
  button.addEventListener("click", () => {
    const language = button.getAttribute("data-lang") === "zh" ? "zh" : "en";
    setLanguage(language);
  });
}

setLanguage(preferredLanguage);
