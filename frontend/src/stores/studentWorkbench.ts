import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";

export type BindingState = "unbound" | "pending" | "bound";
export type ModuleRoute = "assets" | "resume" | "interview";
export type ChatRole = "assistant" | "system" | "user";

type WorkbenchIntent =
  | "experience"
  | "assets"
  | "resume"
  | "evaluation"
  | "interview"
  | "review"
  | "plan";

export interface ChatMessage {
  id: number;
  role: ChatRole;
  title: string;
  lines: string[];
  tags: string[];
  target?: ModuleRoute;
  resultLabel?: string;
}

export interface EvidenceAbility {
  id: number;
  name: string;
  score: string;
  evidence: string;
  source: "growth" | "interview" | "jd";
}

export interface ResumeFact {
  id: number;
  label: string;
  source: string;
  confirmed: boolean;
}

export interface ResumeAsset {
  id: number;
  name: string;
  version: string;
  status: string;
  coverage: string;
}

export interface InterviewStage {
  id: number;
  name: string;
  state: "done" | "current" | "todo";
  note: string;
}

export interface ApplicationItem {
  id: number;
  company: string;
  role: string;
  stage: string;
  nextAction: string;
  synced: boolean;
}

export interface TraceItem {
  id: number;
  title: string;
  source: string;
  result: string;
}

export interface CareerStage {
  id: string;
  title: string;
  period: string;
  status: "structured" | "delivering" | "practicing" | "feeding-back";
  summary: string;
  artifacts: string[];
  module: ModuleRoute;
}

const moduleRoutes: Record<ModuleRoute, string> = {
  assets: "/student/assets",
  resume: "/student/resume",
  interview: "/student/interview"
};

export function modulePath(module: ModuleRoute): string {
  return moduleRoutes[module];
}

export const useStudentWorkbenchStore = defineStore("student-workbench", () => {
  const bindingState = ref<BindingState>("unbound");
  const deviceCode = ref("");
  const evidenceVersion = ref("未导入");
  const evidenceTime = ref("");
  const lastSyncTime = ref("");
  const input = ref("");
  const sending = ref(false);
  const activeIntent = ref<WorkbenchIntent>("experience");
  const evidenceAbilities = ref<EvidenceAbility[]>([]);

  const resumeAssets = ref<ResumeAsset[]>([
    {
      id: 1,
      name: "Java 后端主简历",
      version: "v3",
      status: "待确认 2 个事实",
      coverage: "覆盖 82% 能力证据"
    },
    {
      id: 2,
      name: "前端实习一页版",
      version: "v2",
      status: "已锁定",
      coverage: "覆盖 68% 能力证据"
    }
  ]);

  const resumeDraft = reactive({
    bullet: "宿舍报修小程序：独立完成前后端开发，协作完成接口联调，系统已进入宿舍试用。",
    facts: [
      { id: 1, label: "独立负责模块边界", source: "用户口述", confirmed: false },
      { id: 2, label: "宿舍楼试用范围", source: "成长记录", confirmed: true },
      { id: 3, label: "接口联调过程", source: "项目记录", confirmed: false }
    ] as ResumeFact[]
  });

  const careerStages = ref<CareerStage[]>([
    {
      id: "explore",
      title: "探索期",
      period: "大二",
      status: "structured",
      summary: "宿舍报修小程序从想法走向宿舍试用。",
      artifacts: ["项目记录", "接口联调记录"],
      module: "assets"
    },
    {
      id: "asset",
      title: "能力资产化",
      period: "大三上",
      status: "structured",
      summary: "把经历拆成可复用证据，而不是一次性日记。",
      artifacts: ["后端开发 78", "工程协作 71", "问题定位 66"],
      module: "assets"
    },
    {
      id: "resume",
      title: "简历交付",
      period: "秋招",
      status: "delivering",
      summary: "同一份能力资产生成多个岗位版本。",
      artifacts: ["Java 后端 v3", "前端实习 v2"],
      module: "resume"
    },
    {
      id: "practice",
      title: "投递与面试",
      period: "进行中",
      status: "practicing",
      summary: "真实市场反馈进入面试流程，而不是停留在自我评价。",
      artifacts: ["星野科技笔试", "远山数据一面"],
      module: "interview"
    },
    {
      id: "feedback",
      title: "复盘反哺",
      period: "下一次投递前",
      status: "feeding-back",
      summary: "面试追问和 JD 差距回写到能力资产。",
      artifacts: ["接口权限 STAR", "分布式学习任务"],
      module: "assets"
    }
  ]);

  const interviewStages = ref<InterviewStage[]>([
    { id: 1, name: "JD 解析", state: "done", note: "提取 Spring Boot、MySQL、协作三项要求" },
    { id: 2, name: "简历适配", state: "done", note: "Java 后端主简历 v3 已生成待确认版" },
    { id: 3, name: "投递记录", state: "done", note: "摘要同步需用户确认" },
    { id: 4, name: "笔试准备", state: "done", note: "星野科技笔试材料已核对" },
    { id: 5, name: "一面执行", state: "current", note: "远山数据一面：明天 15:00" },
    { id: 6, name: "面试复盘", state: "todo", note: "等待面试后口述与材料回填" },
    { id: 7, name: "反哺能力资产", state: "todo", note: "生成新的证据与学习任务" }
  ]);

  const applications = ref<ApplicationItem[]>([
    {
      id: 1,
      company: "星野科技",
      role: "Java 后端开发",
      stage: "笔试",
      nextAction: "9月3日 19:00 前提交笔试",
      synced: false
    },
    {
      id: 2,
      company: "远山数据",
      role: "前端开发实习生",
      stage: "一面",
      nextAction: "明天 15:00 面试，先完成项目追问准备",
      synced: false
    },
    {
      id: 3,
      company: "南风教育",
      role: "全栈开发实习生",
      stage: "待评估",
      nextAction: "补充 JD 城市与转正信息",
      synced: false
    }
  ]);

  const traceEvents = ref<TraceItem[]>([
    {
      id: 1,
      title: "能力证据包导出",
      source: "网页能力档案 v0.1",
      result: "只读摘要，已排除简历全文与证书扫描件"
    },
    {
      id: 2,
      title: "本地面试故事生成",
      source: "证据包 + 用户口述复盘",
      result: "生成 STAR 草稿，等待用户确认"
    }
  ]);

  const messages = ref<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      title: "GY Agent",
      lines: [
        "我是你的求职执行入口。直接说要整理经历、改简历、准备面试或复盘。",
        "结果会沉淀到能力资产、简历或面试模块。"
      ],
      tags: ["Agent 优先", "模块分离"]
    }
  ]);

  const bindingLabel = computed(
    () =>
      ({
        unbound: "未绑定",
        pending: "待确认",
        bound: "已绑定"
      })[bindingState.value]
  );
  const confirmedFactCount = computed(() => resumeDraft.facts.filter((fact) => fact.confirmed).length);
  const connectCommand = computed(() => (deviceCode.value ? `gy connect ${deviceCode.value}` : ""));
  const latestTrace = computed(() => traceEvents.value.slice(0, 3));

  let messageId = 2;
  let traceId = 3;

  function generateDeviceCode() {
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    deviceCode.value = `GY-${suffix}`;
    bindingState.value = "pending";
  }

  function confirmBinding() {
    bindingState.value = "bound";
    evidenceVersion.value = "evidence-v0.1-20260901";
    evidenceTime.value = "刚刚";
    evidenceAbilities.value = [
      { id: 1, name: "后端开发", score: "78 / 100", evidence: "实习项目 + 挑战交付 + 课程设计", source: "growth" },
      { id: 2, name: "工程协作", score: "71 / 100", evidence: "接口联调记录 + 团队复盘", source: "growth" },
      { id: 3, name: "问题定位", score: "66 / 100", evidence: "线上问题复盘 + 测试通过记录", source: "growth" }
    ];
    pushMessage(
      "system",
      "本地工位已连接",
      [
        `能力证据包 ${evidenceVersion.value} 已进入本地。`,
        "简历全文、证书扫描件和面试逐字稿仍只保留在本机。"
      ],
      ["最小下发", "本地保留"]
    );
    addTrace("设备绑定与证据包导入", "网页授权码 + 本地 gy 入口", "只读证据摘要已进入本地工作台");
  }

  function unbind() {
    bindingState.value = "unbound";
    deviceCode.value = "";
    evidenceVersion.value = "未导入";
    evidenceTime.value = "";
    lastSyncTime.value = "";
    evidenceAbilities.value = [];
    applications.value = applications.value.map((item) => ({ ...item, synced: false }));
    pushMessage(
      "system",
      "设备已解绑",
      ["同步授权已失效，本地产物不会被删除。", "可以重新生成绑定码连接这台或另一台设备。"],
      ["授权撤销", "本地保留"]
    );
    addTrace("设备解绑", "网页端用户操作", "云端摘要连接断开，本地文件保留");
  }

  async function submitMessage(submitted = input.value) {
    const text = submitted.trim();
    if (!text || sending.value) return;
    input.value = "";
    activeIntent.value = detectIntent(text);
    pushMessage("user", "我", [text], []);
    sending.value = true;
    await new Promise((resolve) => setTimeout(resolve, 480));
    const response = buildResponse(activeIntent.value);
    pushMessage("assistant", response.title, response.lines, response.tags, response.target, response.resultLabel);
    applyIntent(activeIntent.value);
    addTrace(response.traceTitle, response.traceSource, response.traceResult);
    sending.value = false;
  }

  function detectIntent(text: string): WorkbenchIntent {
    if (/简历|简历条目|一页版|投递材料/.test(text)) return "resume";
    if (/岗位|公司|值得投|JD|jd/.test(text)) return "evaluation";
    if (/复盘|反哺|被追问|刚才面试/.test(text)) return "review";
    if (/面试|笔试/.test(text)) return "interview";
    if (/能力资产|结构化|证据/.test(text)) return "assets";
    if (/这周|本周|计划|优先级/.test(text)) return "plan";
    return "experience";
  }

  function buildResponse(intent: WorkbenchIntent) {
    if (intent === "resume") {
      return {
        title: "简历条目草稿",
        lines: [
          "独立完成宿舍报修小程序前后端开发，覆盖报修、派单与状态追踪流程。",
          "与同学协作完成接口联调，沉淀接口约定和联调记录；系统已在宿舍楼试用。",
          "待确认：你个人负责的模块边界、使用人数、故障处理时长。"
        ],
        tags: ["证据状态", "不编造结果"],
        target: "resume" as const,
        resultLabel: "已沉淀到简历管理",
        traceTitle: "简历条目生成",
        traceSource: "能力资产 + 用户口述",
        traceResult: "生成候选 bullet，未确认事实不会进入锁定版本"
      };
    }
    if (intent === "evaluation") {
      return {
        title: "岗位评估草稿",
        lines: [
          "匹配度 74%：Spring Boot、MySQL、接口联调有证据支持；分布式经验不足。",
          "风险信号：岗位描述未写工作地点，需要补充确认。",
          "建议：暂缓投递，先补齐城市与转正信息。"
        ],
        tags: ["规则复核", "本地报告"],
        target: "interview" as const,
        resultLabel: "已沉淀到面试管理",
        traceTitle: "岗位评估生成",
        traceSource: "JD 文本 + 能力证据包",
        traceResult: "生成匹配度、风险与建议，未自动写入投递清单"
      };
    }
    if (intent === "interview") {
      return {
        title: "面试流程准备",
        lines: [
          "项目追问：宿舍报修小程序的接口权限是如何设计的？",
          "协作追问：接口联调出现分歧时，你如何推进结论？",
          "结果追问：系统最终有多少人使用，故障率有没有下降？",
          "面试后的回答会转成复盘证据，再回写能力资产。"
        ],
        tags: ["STAR 草稿", "流程闭环"],
        target: "interview" as const,
        resultLabel: "已沉淀到面试管理",
        traceTitle: "面试准备生成",
        traceSource: "岗位评估 + 简历素材 + 能力资产",
        traceResult: "生成三个追问点和一份 STAR 草稿"
      };
    }
    if (intent === "review") {
      return {
        title: "复盘反哺草稿",
        lines: [
          "新增证据：你在面试中说明了接口权限从分歧到约定文档的过程。",
          "能力变化：工程协作证据增强，问题定位仍缺量化结果。",
          "该证据会标记来源为面试复盘，不会覆盖原始成长记录。"
        ],
        tags: ["面试来源", "资产更新"],
        target: "assets" as const,
        resultLabel: "已反哺能力资产",
        traceTitle: "面试复盘反哺",
        traceSource: "面试口述 + 原能力资产",
        traceResult: "新增候选证据与学习任务，等待用户确认"
      };
    }
    if (intent === "plan") {
      return {
        title: "本周行动建议",
        lines: [
          "今天：确认远山数据一面设备、时间与项目演示材料。",
          "周三前：补充南风教育岗位城市和招聘批次。",
          "周五前：把远山数据一面复盘成一条可复用 STAR 故事。"
        ],
        tags: ["少量行动", "说明原因"],
        target: "interview" as const,
        resultLabel: "已沉淀到面试管理",
        traceTitle: "周计划生成",
        traceSource: "投递状态 + 面试流程 + 能力差距",
        traceResult: "输出三优先级动作，不自动写入日程"
      };
    }
    if (intent === "assets") {
      return {
        title: "能力资产草稿",
        lines: [
          "从宿舍报修小程序提取三项证据：前后端实现、接口协作、宿舍试用。",
          "可归入后端开发、工程协作两个能力维度。",
          "缺少量化结果，先标记为待补证，不进入简历锁定版。"
        ],
        tags: ["结构化", "可追溯"],
        target: "assets" as const,
        resultLabel: "已沉淀到能力资产",
        traceTitle: "能力资产结构化",
        traceSource: "成长记录 + 用户口述",
        traceResult: "生成候选证据，保留原经历链接"
      };
    }
    return {
      title: "成长经历整理",
      lines: [
        "已把这个经历挂到职业成长树的探索期，再提取可复用能力资产。",
        "识别项目交付、跨端协作、真实使用三个结构化维度。",
        "下一步可以生成简历条目，或者等你补充结果数据后再生成。"
      ],
      tags: ["成长树", "证据驱动"],
      target: "assets" as const,
      resultLabel: "已沉淀到能力资产",
      traceTitle: "成长经历入树",
      traceSource: "用户口述 + 平台成长记录",
      traceResult: "更新职业成长主线与候选能力证据"
    };
  }

  function applyIntent(intent: WorkbenchIntent) {
    if (intent === "experience" || intent === "assets") {
      if (!evidenceAbilities.value.some((item) => item.id === 4)) {
        evidenceAbilities.value.push({
          id: 4,
          name: "跨端协作",
          score: "待评分",
          evidence: "宿舍报修小程序前后端联调",
          source: "growth"
        });
      }
      return;
    }
    if (intent === "resume") {
      resumeDraft.bullet =
        "宿舍报修小程序：独立完成前后端开发，协作完成接口联调，系统已进入宿舍试用。";
      return;
    }
    if (intent === "review") {
      if (!evidenceAbilities.value.some((item) => item.id === 5)) {
        evidenceAbilities.value.push({
          id: 5,
          name: "接口权限表达",
          score: "候选证据",
          evidence: "远山数据一面追问：从分歧到约定文档",
          source: "interview"
        });
      }
      interviewStages.value = interviewStages.value.map((stage) =>
        stage.id === 6 ? { ...stage, state: "current", note: "已生成复盘草稿，等待确认" } : stage
      );
    }
  }

  function confirmResumeFact(factId: number) {
    resumeDraft.facts = resumeDraft.facts.map((fact) =>
      fact.id === factId ? { ...fact, confirmed: true } : fact
    );
    if (resumeDraft.facts.every((fact) => fact.confirmed)) {
      resumeAssets.value = resumeAssets.value.map((asset) =>
        asset.id === 1 ? { ...asset, status: "已锁定", coverage: "覆盖 86% 能力证据" } : asset
      );
    }
    addTrace("简历事实确认", `本地简历条目：${resumeDraft.bullet.slice(0, 18)}...`, "用户确认事实后才能锁定简历版本");
  }

  function confirmSync(item: ApplicationItem) {
    applications.value = applications.value.map((application) =>
      application.id === item.id ? { ...application, synced: true } : application
    );
    lastSyncTime.value = "刚刚";
    addTrace(
      "求职摘要同步",
      `本地面试管理：${item.company}`,
      "仅同步公司、岗位、阶段和下一步，未上传报告全文"
    );
  }

  function pushMessage(
    role: ChatRole,
    title: string,
    lines: string[],
    tags: string[],
    target?: ModuleRoute,
    resultLabel?: string
  ) {
    messages.value.push({ id: messageId++, role, title, lines, tags, target, resultLabel });
  }

  function addTrace(title: string, source: string, result: string) {
    traceEvents.value.unshift({ id: traceId++, title, source, result });
  }

  return {
    bindingState,
    deviceCode,
    evidenceVersion,
    evidenceTime,
    lastSyncTime,
    input,
    sending,
    activeIntent,
    evidenceAbilities,
    resumeAssets,
    resumeDraft,
    careerStages,
    interviewStages,
    applications,
    traceEvents,
    messages,
    bindingLabel,
    confirmedFactCount,
    connectCommand,
    latestTrace,
    generateDeviceCode,
    confirmBinding,
    unbind,
    submitMessage,
    detectIntent,
    confirmResumeFact,
    confirmSync
  };
});
