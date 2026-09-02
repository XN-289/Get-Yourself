import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { workbenchDeviceApi, type WorkbenchDevice } from "@/api/workbenchDevice";

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
  plan?: SkillExecutionPlan;
}

export type SkillExecutionPlanStatus = "pending" | "approved" | "rejected";

export interface SkillExecutionPlan {
  id: number;
  intent: WorkbenchIntent;
  skillKey: string;
  skillName: string;
  target: ModuleRoute;
  targetLabel: string;
  writes: string[];
  untouched: string[];
  status: SkillExecutionPlanStatus;
}

export interface EvidenceAbility {
  id: number;
  name: string;
  score: string;
  evidence: string;
  source: "growth" | "interview" | "jd";
}

export type ResumeVersionStatus = "draft" | "final" | "exported";
export type ResumeDocumentSource = "agent" | "import" | "manual";

export interface ResumeVersion {
  id: number;
  version: number;
  status: ResumeVersionStatus;
  templateId: string;
  updatedAt: string;
  source: ResumeDocumentSource;
  fileName?: string;
  changeNote: string;
  content: string;
}

export interface ResumeDocument {
  id: number;
  title: string;
  targetRole: string;
  activeVersionId: number;
  versions: ResumeVersion[];
}

export interface ResumeDocumentInput {
  title: string;
  targetRole: string;
  templateId: string;
  content: string;
  source?: ResumeDocumentSource;
  fileName?: string;
  changeNote?: string;
}

export interface ResumeTemplate {
  id: string;
  nameZh: string;
  atsPosture: "friendly" | "acceptable" | "limited";
  useCases: string[];
}

export type ProcessStageStatus = "todo" | "active" | "waiting" | "passed" | "failed" | "offer";

export interface ProcessStage {
  id: number;
  name: string;
  status: ProcessStageStatus;
  note: string;
  nextAction?: string;
  skillKey: string;
  skillName: string;
  encouragement: string;
  artifact?: string;
  date?: string;
}

export interface CompanyOpportunity {
  id: number;
  company: string;
  role: string;
  nextAction: string;
  synced: boolean;
  stages: ProcessStage[];
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
  const activeDevices = ref<WorkbenchDevice[]>([]);
  const pendingDevices = ref<WorkbenchDevice[]>([]);
  const deviceCode = ref("");
  const deviceCodeExpiresAt = ref("");
  const deviceError = ref("");
  const deviceBusy = ref(false);
  const devicesInitialized = ref(false);
  const evidenceVersion = ref("未导入");
  const evidenceTime = ref("");
  const lastSyncTime = ref("");
  const input = ref("");
  const sending = ref(false);
  const activeIntent = ref<WorkbenchIntent>("experience");
  const evidenceAbilities = ref<EvidenceAbility[]>([]);

  const resumeDocuments = ref<ResumeDocument[]>([
    {
      id: 1,
      title: "Java 后端主简历",
      targetRole: "Java 后端开发",
      activeVersionId: 103,
      versions: [
        {
          id: 101,
          version: 1,
          status: "final",
          templateId: "tech-compact",
          updatedAt: "2026-08-29 10:12",
          source: "agent",
          changeNote: "首版整合实习与项目经历",
          content: `# 李雷 · Java 后端开发

## 摘要
后端实习经历覆盖接口设计和前端联调。

## 实习与项目
### 校园技术团队 · 后端开发实习生
- 设计宿舍报修接口，支撑报修流程进入宿舍试用。
- 与前端约定接口契约，减少接口理解偏差。
`
        },
        {
          id: 102,
          version: 2,
          status: "exported",
          templateId: "tech-compact",
          updatedAt: "2026-08-31 15:26",
          source: "agent",
          changeNote: "补充小程序真实使用进展",
          content: `# 李雷 · Java 后端开发

## 摘要
后端实习经历覆盖接口设计、前端联调和宿舍试用落地。

## 实习与项目
### 校园技术团队 · 后端开发实习生
- 设计宿舍报修接口，支撑报修流程进入宿舍试用。
- 与前端约定接口契约，减少接口理解偏差。

### 宿舍报修小程序 · 后端负责人
- 完成报修创建、状态更新和查询接口。
- 沉淀接口约定和联调记录。`
        },
        {
          id: 103,
          version: 3,
          status: "final",
          templateId: "tech-compact",
          updatedAt: "2026-09-02 09:20",
          source: "agent",
          changeNote: "面向秋招补强项目结果",
          content: `# 李雷 · Java 后端开发

## 摘要
后端实习经历覆盖接口设计、前端联调和宿舍试用落地，持续沉淀接口文档与联调记录。

## 实习与项目
### 校园技术团队 · 后端开发实习生
- 设计宿舍报修接口，支撑报修流程进入宿舍试用。
- 与前端约定接口契约，减少接口理解偏差。

### 宿舍报修小程序 · 后端负责人
- 完成报修创建、状态更新和查询接口。
- 沉淀接口约定和联调记录，降低后续维护成本。`
        }
      ]
    },
    {
      id: 2,
      title: "前端实习一页版",
      targetRole: "前端开发实习生",
      activeVersionId: 202,
      versions: [
        {
          id: 201,
          version: 1,
          status: "final",
          templateId: "modern-sidebar",
          updatedAt: "2026-08-30 19:04",
          source: "agent",
          changeNote: "一页版初稿",
          content: `# 李雷 · 前端开发实习生

## 摘要
熟悉组件开发与接口联调，能把设计稿落成可试用页面。

## 项目
### 宿舍报修小程序 · 前端协作者
- 完成报修表单、状态列表和详情页组件。`
        },
        {
          id: 202,
          version: 2,
          status: "final",
          templateId: "modern-sidebar",
          updatedAt: "2026-09-01 16:40",
          source: "agent",
          changeNote: "补齐联调问题记录",
          content: `# 李雷 · 前端开发实习生

## 摘要
熟悉组件开发与接口联调，能把设计稿落成可试用页面。

## 项目
### 宿舍报修小程序 · 前端协作者
- 完成报修表单、状态列表和详情页组件。
- 参与接口契约确认，记录前后端联调问题。`
        }
      ]
    },
    {
      id: 3,
      title: "供应链系统简历",
      targetRole: "供应链系统实习生",
      activeVersionId: 301,
      versions: [
        {
          id: 301,
          version: 1,
          status: "exported",
          templateId: "classic-ats",
          updatedAt: "2026-08-30 11:10",
          source: "import",
          fileName: "supply-chain-resume.md",
          changeNote: "本机成品导入",
          content: `# 李雷 · 供应链系统实习生

## 摘要
具备 Java、SQL 和业务流程建模基础，关注系统落地后的真实使用效果。`
        }
      ]
    }
  ]);

  const resumeTemplates = ref<ResumeTemplate[]>([
    {
      id: "classic-ats",
      nameZh: "经典 ATS",
      atsPosture: "friendly",
      useCases: ["通用校招", "国央企", "银行金融", "传统行业"]
    },
    {
      id: "ledger",
      nameZh: "账目风",
      atsPosture: "friendly",
      useCases: ["通用校招", "财务会计", "供应链", "银行金融"]
    },
    {
      id: "tech-compact",
      nameZh: "技术紧凑",
      atsPosture: "acceptable",
      useCases: ["互联网技术", "软件实习", "项目密集", "竞赛密集"]
    },
    {
      id: "modern-sidebar",
      nameZh: "现代侧栏",
      atsPosture: "limited",
      useCases: ["产品设计", "运营市场", "创意岗位", "作品集型简历"]
    },
    {
      id: "pillar",
      nameZh: "栏式结构",
      atsPosture: "limited",
      useCases: ["产品运营", "综合经历密集", "双栏阅读"]
    },
    {
      id: "elegant-serif",
      nameZh: "雅致衬线",
      atsPosture: "limited",
      useCases: ["研究型岗位", "教育公共事务", "文社科背景"]
    },
    {
      id: "atelier",
      nameZh: "工作室",
      atsPosture: "limited",
      useCases: ["设计岗位", "视觉作品集", "创意实习"]
    },
    {
      id: "timeline",
      nameZh: "时间线",
      atsPosture: "limited",
      useCases: ["成长主线清晰", "多段实习", "项目演进叙事"]
    },
    {
      id: "swiss",
      nameZh: "瑞士网格",
      atsPosture: "limited",
      useCases: ["数据严谨岗位", "咨询研究", "结构化表达"]
    },
    {
      id: "executive",
      nameZh: "稳重型",
      atsPosture: "limited",
      useCases: ["管理培训生", "市场商务", "综合能力叙事"]
    },
    {
      id: "colorblock",
      nameZh: "色块强调",
      atsPosture: "limited",
      useCases: ["新媒体运营", "校园招聘会打印版", "视觉强调"]
    }
  ]);
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

  const opportunities = ref<CompanyOpportunity[]>([
    {
      id: 1,
      company: "星野科技",
      role: "Java 后端开发",
      nextAction: "9月3日 19:00 前提交笔试",
      synced: false,
      stages: [
        {
          id: 101,
          name: "JD 分析",
          status: "passed",
          note: "提取 Spring Boot、MySQL、协作三项要求",
          skillKey: "jd-analysis",
          skillName: "JD 分析",
          encouragement: "JD 拆完了，方向清楚了。",
          artifact: "岗位评估报告 v1"
        },
        {
          id: 102,
          name: "简历适配",
          status: "passed",
          note: "Java 后端主简历 v3 已生成",
          skillKey: "resume-tailoring",
          skillName: "简历写作",
          encouragement: "这份简历已经对准岗位，不是海投版本。",
          artifact: "Java 后端 v3"
        },
        {
          id: 103,
          name: "投递",
          status: "passed",
          note: "官网投递完成，回执已归档",
          nextAction: "保留回执链接",
          skillKey: "application-submission",
          skillName: "投递材料检查",
          encouragement: "投出去就是一次真实市场校验。",
          date: "8月28日"
        },
        {
          id: 104,
          name: "笔试",
          status: "active",
          note: "编程题 + 系统设计基础",
          nextAction: "9月3日 19:00 前提交",
          skillKey: "written-test-prep",
          skillName: "笔试准备",
          encouragement: "笔试前每完成一套题，都是在降低未知。",
          date: "9月3日 19:00"
        },
        {
          id: 105,
          name: "一面",
          status: "todo",
          note: "等待笔试结果后安排",
          skillKey: "interview-prep",
          skillName: "面试准备",
          encouragement: "到这一步时，你已经带着岗位证据进场。"
        },
        {
          id: 106,
          name: "面试复盘",
          status: "todo",
          note: "面试后由用户口述或粘贴记录",
          skillKey: "interview-review",
          skillName: "面试复盘",
          encouragement: "每次复盘都会留下可复用证据。"
        },
        {
          id: 107,
          name: "反哺能力资产",
          status: "todo",
          note: "生成新的证据与学习任务",
          skillKey: "asset-feedback",
          skillName: "资产反哺",
          encouragement: "真实反馈会让能力资产更接近市场。"
        }
      ]
    },
    {
      id: 2,
      company: "远山数据",
      role: "前端开发实习生",
      nextAction: "明天 15:00 面试，先完成项目追问准备",
      synced: false,
      stages: [
        {
          id: 201,
          name: "JD 分析",
          status: "passed",
          note: "确认组件设计、接口协作和实习时长",
          skillKey: "jd-analysis",
          skillName: "JD 分析",
          encouragement: "岗位重点已经拆出来了。",
          artifact: "岗位评估报告 v1"
        },
        {
          id: 202,
          name: "简历适配",
          status: "passed",
          note: "前端实习一页版 v2 已锁定",
          skillKey: "resume-tailoring",
          skillName: "简历写作",
          encouragement: "一页版更贴近实习岗的阅读速度。",
          artifact: "前端实习 v2"
        },
        {
          id: 203,
          name: "投递",
          status: "passed",
          note: "邮箱投递完成",
          skillKey: "application-submission",
          skillName: "投递材料检查",
          encouragement: "这次投递已经完成了市场校验的第一步。",
          date: "8月25日"
        },
        {
          id: 204,
          name: "一面",
          status: "active",
          note: "项目与协作追问",
          nextAction: "明天 15:00，先完成项目追问准备",
          skillKey: "interview-prep",
          skillName: "面试准备",
          encouragement: "讲出来的经历已经开始变成你的资产。",
          date: "9月2日 15:00"
        },
        {
          id: 205,
          name: "面试复盘",
          status: "todo",
          note: "等待面试后回填",
          skillKey: "interview-review",
          skillName: "面试复盘",
          encouragement: "复盘会把临场表现沉淀成下一轮准备。"
        },
        {
          id: 206,
          name: "反哺能力资产",
          status: "todo",
          note: "把追问转成证据和学习任务",
          skillKey: "asset-feedback",
          skillName: "资产反哺",
          encouragement: "面试反馈会反向校准能力资产。"
        }
      ]
    },
    {
      id: 3,
      company: "南风教育",
      role: "全栈开发实习生",
      nextAction: "补充 JD 城市与转正信息",
      synced: false,
      stages: [
        {
          id: 301,
          name: "JD 分析",
          status: "waiting",
          note: "岗位描述缺少城市与转正信息",
          nextAction: "补充城市、转正和招聘批次",
          skillKey: "jd-analysis",
          skillName: "JD 分析",
          encouragement: "先把关键信息问清楚，再决定是否投入简历。"
        },
        {
          id: 302,
          name: "简历适配",
          status: "todo",
          note: "等待 JD 分析结论",
          skillKey: "resume-tailoring",
          skillName: "简历写作",
          encouragement: "适配会从能力资产中取证据，不重写一份空简历。"
        },
        {
          id: 303,
          name: "投递",
          status: "todo",
          note: "等待评估和简历确认",
          skillKey: "application-submission",
          skillName: "投递材料检查",
          encouragement: "确认后再投，一次投递就是一次有效校验。"
        }
      ]
    },
    {
      id: 4,
      company: "云洲物流",
      role: "供应链系统实习生",
      nextAction: "确认入职材料清单",
      synced: true,
      stages: [
        {
          id: 401,
          name: "JD 分析",
          status: "passed",
          note: "确认 Java 基础、SQL 和业务理解要求",
          skillKey: "jd-analysis",
          skillName: "JD 分析",
          encouragement: "这份 JD 的能力要求已经拆清楚。",
          artifact: "岗位评估报告 v1"
        },
        {
          id: 402,
          name: "简历适配",
          status: "passed",
          note: "供应链系统版本 v1 已锁定",
          skillKey: "resume-tailoring",
          skillName: "简历写作",
          encouragement: "项目条目已经对准供应链场景。",
          artifact: "供应链系统 v1"
        },
        {
          id: 403,
          name: "投递",
          status: "passed",
          note: "校招系统投递完成",
          skillKey: "application-submission",
          skillName: "投递材料检查",
          encouragement: "材料齐全再投递，这一步做得很稳。",
          date: "8月20日"
        },
        {
          id: 404,
          name: "一面",
          status: "passed",
          note: "项目实现与 SQL 追问",
          skillKey: "interview-prep",
          skillName: "面试准备",
          encouragement: "项目细节能讲清楚，是这轮通过的基础。",
          date: "8月24日"
        },
        {
          id: 405,
          name: "二面",
          status: "passed",
          note: "业务场景与学习计划追问",
          skillKey: "interview-prep",
          skillName: "面试准备",
          encouragement: "二面能聊业务场景，说明准备开始复用了。",
          date: "8月27日"
        },
        {
          id: 406,
          name: "HR 面",
          status: "passed",
          note: "实习时间与入职材料确认",
          skillKey: "interview-prep",
          skillName: "面试准备",
          encouragement: "把时间边界讲清楚，也是职业沟通能力。",
          date: "8月30日"
        },
        {
          id: 407,
          name: "Offer",
          status: "offer",
          note: "口头 Offer 已确认，邮件待归档",
          nextAction: "确认入职材料清单",
          skillKey: "offer-checklist",
          skillName: "Offer 核对",
          encouragement: "Offer 拿下了，这一路的每一步都算数。",
          artifact: "Offer 检查清单"
        }
      ]
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
        "写入型结果确认后会进入能力资产、简历或面试模块。"
      ],
      tags: ["Agent 优先", "模块分离"]
    }
  ]);

  const bindingState = computed<BindingState>(() => {
    if (pendingDevices.value.length > 0) return "pending";
    return activeDevices.value.length > 0 ? "bound" : "unbound";
  });
  const primaryDevice = computed(() => activeDevices.value[0] ?? null);
  const bindingLabel = computed(
    () =>
      ({
        unbound: "未绑定",
        pending: "待确认",
        bound: activeDevices.value.length > 1 ? `已绑定 ${activeDevices.value.length} 台` : "已绑定"
      })[bindingState.value]
  );
  const resumeVersions = computed(() => resumeDocuments.value.flatMap((document) => document.versions));
  const resumeStatusCount = computed(() => ({
    draft: resumeVersions.value.filter((item) => item.status === "draft").length,
    final: resumeVersions.value.filter((item) => item.status === "final").length,
    exported: resumeVersions.value.filter((item) => item.status === "exported").length
  }));
  const connectCommand = computed(() =>
    deviceCode.value ? `node cli/gy.mjs connect ${deviceCode.value}` : ""
  );
  const latestTrace = computed(() => traceEvents.value.slice(0, 3));

  let messageId = 2;
  let traceId = 3;
  let skillPlanId = 1;
  let processStageId = 500;
  let resumeDocumentId = 4;
  let resumeVersionId = 400;
  let devicePollTimer: ReturnType<typeof setInterval> | null = null;

  function formatDeviceTime(value: string | null) {
    if (!value) return "暂无记录";
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) return "暂无记录";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(time);
  }

  function stopDevicePolling() {
    if (devicePollTimer === null) return;
    clearInterval(devicePollTimer);
    devicePollTimer = null;
  }

  function startDevicePolling() {
    if (devicePollTimer !== null) return;
    devicePollTimer = setInterval(() => {
      void refreshDevices();
    }, 3000);
  }

  function applyDevices(devices: WorkbenchDevice[]) {
    const pendingIds = new Set(pendingDevices.value.map((device) => device.id));
    activeDevices.value = devices.filter((device) => device.status === "active");
    pendingDevices.value = devices.filter((device) => {
      if (device.status !== "pending" || !device.expiresAt) return false;
      return new Date(device.expiresAt).getTime() > Date.now();
    });

    if (pendingDevices.value.length > 0 || activeDevices.value.length > 0) startDevicePolling();
    else {
      stopDevicePolling();
      deviceCode.value = "";
      deviceCodeExpiresAt.value = "";
    }

    const newlyBoundDevice = activeDevices.value.find((device) => pendingIds.has(device.id));
    if (newlyBoundDevice) {
      const device = newlyBoundDevice;
      pushMessage(
        "system",
        "本地工位已连接",
        [
          `${device.deviceName} 已完成设备授权。`,
          "本次绑定不会自动导入能力证据包，也不会上传简历全文或原始材料。"
        ],
        ["显式绑定", "本地保留"]
      );
      addTrace(
        "设备绑定完成",
        `本地工作台 · ${device.deviceName}`,
        "设备 token 仅保留在本机，未自动导入证据或同步求职数据"
      );
    }
  }

  async function refreshDevices(force = false) {
    if (deviceBusy.value && !force) return;
    try {
      deviceError.value = "";
      applyDevices(await workbenchDeviceApi.list());
      devicesInitialized.value = true;
    } catch (error) {
      deviceError.value = error instanceof Error ? error.message : "设备状态读取失败";
    }
  }

  async function initializeDevices() {
    if (devicesInitialized.value) return;
    await refreshDevices();
  }

  async function generateDeviceCode() {
    if (deviceBusy.value) return;
    deviceBusy.value = true;
    try {
      const code = await workbenchDeviceApi.createCode();
      deviceCode.value = code.deviceCode;
      deviceCodeExpiresAt.value = code.expiresAt;
      deviceError.value = "";
      pendingDevices.value = [
        {
          id: code.id,
          deviceName: "待确认设备",
          status: "pending",
          expiresAt: code.expiresAt,
          boundAt: null,
          lastActiveAt: null,
          createdAt: new Date().toISOString()
        }
      ];
      startDevicePolling();
      addTrace("设备绑定码生成", "网页端用户操作", "绑定码 10 分钟内有效，只存服务端哈希");
    } catch (error) {
      deviceError.value = error instanceof Error ? error.message : "绑定码生成失败";
    } finally {
      deviceBusy.value = false;
    }
  }

  async function unbind(deviceId: number) {
    if (deviceBusy.value) return;
    deviceBusy.value = true;
    try {
      await workbenchDeviceApi.unbind(deviceId);
      deviceError.value = "";
      await refreshDevices(true);
      pushMessage(
        "system",
        "设备已解绑",
        ["这台设备的云端授权已失效。", "本地简历、报告和绑定前导入的证据文件不会被删除。"],
        ["授权撤销", "本地保留"]
      );
      addTrace("设备解绑", "网页端用户操作", "云端摘要连接断开，本地文件保留");
    } catch (error) {
      deviceError.value = error instanceof Error ? error.message : "设备解绑失败";
    } finally {
      deviceBusy.value = false;
    }
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
    addTrace(response.traceTitle, response.traceSource, response.traceResult);
    if (isWriteIntent(activeIntent.value)) {
      pushSkillPlan(createSkillPlan(activeIntent.value));
    }
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
        title: "完整简历草稿",
        lines: [
          "独立完成宿舍报修小程序前后端开发，覆盖报修、派单与状态追踪流程。",
          "与同学协作完成接口联调，沉淀接口约定和联调记录；系统已在宿舍楼试用。",
          "待确认后定稿：个人负责的模块边界、使用人数、故障处理时长。"
        ],
        tags: ["证据状态", "不编造结果"],
        target: "resume" as const,
        resultLabel: "查看目标模块（未写入）",
        traceTitle: "完整简历草稿生成",
        traceSource: "能力资产 + 用户口述",
        traceResult: "已生成执行计划；确认前不写入简历版本"
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
        resultLabel: "查看目标模块（未写入）",
        traceTitle: "岗位评估生成",
        traceSource: "JD 文本 + 能力证据包",
        traceResult: "生成匹配度、风险与建议，本轮不写入投递清单"
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
        resultLabel: "查看目标模块（未写入）",
        traceTitle: "面试准备生成",
        traceSource: "岗位评估 + 简历素材 + 能力资产",
        traceResult: "生成三个追问点和一份 STAR 草稿，本轮不修改流程节点"
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
        resultLabel: "查看目标模块（未写入）",
        traceTitle: "面试复盘反哺",
        traceSource: "面试口述 + 原能力资产",
        traceResult: "已生成反哺执行计划，确认前不改能力资产"
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
        resultLabel: "查看面试管理（只读）",
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
      resultLabel: "查看目标模块（未写入）",
      traceTitle: "能力资产结构化",
      traceSource: "成长记录 + 用户口述",
      traceResult: "生成候选证据；确认前不改能力资产"
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
      resultLabel: "查看目标模块（未写入）",
      traceTitle: "成长经历入树",
      traceSource: "用户口述 + 平台成长记录",
      traceResult: "已生成结构化执行计划，确认前不改能力资产"
    };
  }

  function isWriteIntent(intent: WorkbenchIntent) {
    return intent === "experience" || intent === "assets" || intent === "resume" || intent === "review";
  }

  function createSkillPlan(intent: WorkbenchIntent): SkillExecutionPlan {
    if (intent === "resume") {
      return {
        id: skillPlanId++,
        intent,
        skillKey: "resume-tailoring",
        skillName: "简历写作",
        target: "resume",
        targetLabel: "简历管理 · Java 后端主简历",
        writes: ["更新该简历线唯一草稿", "生成待确认事实清单"],
        untouched: ["定稿和已导出版本", "当前投递版", "本地文件与 PDF"],
        status: "pending"
      };
    }
    if (intent === "review") {
      return {
        id: skillPlanId++,
        intent,
        skillKey: "asset-feedback",
        skillName: "资产反哺",
        target: "assets",
        targetLabel: "能力资产 · 面试复盘证据",
        writes: ["新增接口权限表达候选证据", "更新远山数据一面复盘节点为进行中"],
        untouched: ["通过、未通过与 Offer 结果", "简历版本", "云端数据与本地文件"],
        status: "pending"
      };
    }
    return {
      id: skillPlanId++,
      intent,
      skillKey: intent === "assets" ? "asset-structuring" : "experience-structuring",
      skillName: intent === "assets" ? "能力资产结构化" : "成长经历结构化",
      target: "assets",
      targetLabel: "能力资产 · 职业成长树",
      writes: ["新增跨端协作候选证据"],
      untouched: ["能力评分", "简历定稿和导出版", "面试流程状态"],
      status: "pending"
    };
  }

  function pushSkillPlan(plan: SkillExecutionPlan) {
    messages.value.push({
      id: messageId++,
      role: "system",
      title: "执行确认",
      lines: [],
      tags: ["等待确认"],
      plan
    });
  }

  function updatePlanStatus(plan: SkillExecutionPlan, status: Exclude<SkillExecutionPlanStatus, "pending">) {
    messages.value = messages.value.map((message) =>
      message.plan?.id === plan.id
        ? { ...message, plan: { ...message.plan, status }, tags: [skillPlanStatusLabel(status)] }
        : message
    );
  }

  function confirmSkillPlan(plan: SkillExecutionPlan) {
    if (plan.status !== "pending") return;
    applyIntent(plan.intent);
    updatePlanStatus(plan, "approved");
    addTrace(
      "Skill 执行确认",
      plan.skillName,
      "用户确认后才写入目标模块，未越界修改状态、定稿或云端数据"
    );
    pushMessage(
      "system",
      "执行完成",
      [`${plan.skillName} 已写入${plan.targetLabel}。`],
      ["用户确认", "边界保留"],
      plan.target,
      "打开模块查看结果"
    );
  }

  function rejectSkillPlan(plan: SkillExecutionPlan) {
    if (plan.status !== "pending") return;
    updatePlanStatus(plan, "rejected");
    addTrace("Skill 计划取消", plan.skillName, "用户取消，目标模块和本地文件均未修改");
    pushMessage(
      "system",
      "已取消执行",
      ["本次只保留对话结果，未修改目标模块。"],
      ["用户取消"]
    );
  }

  function skillPlanStatusLabel(status: SkillExecutionPlanStatus) {
    return (
      {
        pending: "待确认",
        approved: "已执行",
        rejected: "已取消"
      })[status];
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
      const title = "Java 后端主简历";
      const existing = resumeDocuments.value.find((item) => item.title === title);
      const content = `# 李雷 · Java 后端开发

## 摘要
后端实习经历覆盖接口设计、前端联调和宿舍试用落地，可继续补充量化结果。

## 待确认
- 个人负责的模块边界
- 宿舍楼试用范围
- 接口联调过程`;
      if (!existing) return;
      const base =
        existing.versions.find((item) => item.id === existing.activeVersionId) ?? existing.versions[0];
      const draft = existing.versions.find((item) => item.status === "draft");
      const patch = {
        title: existing.title,
        targetRole: existing.targetRole,
        templateId: base.templateId,
        content,
        source: "agent" as const,
        changeNote: "Agent 生成待确认草稿"
      };
      if (draft) updateResumeDraft(existing.id, draft.id, patch);
      else createResumeDraft(existing.id, base.id, patch);
      addTrace(
        "Agent 简历草稿",
        existing.title,
        "只写入草稿版本，不覆盖定稿或已导出版本"
      );
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
      opportunities.value = opportunities.value.map((opportunity) =>
        opportunity.id === 2
          ? {
              ...opportunity,
              nextAction: "确认远山数据一面复盘草稿",
              stages: opportunity.stages.map((stage) =>
                stage.id === 205
                  ? { ...stage, status: "active" as const, note: "已生成复盘草稿，等待确认" }
                  : stage
              )
            }
          : opportunity
      );
    }
  }

  function normalizeResumeDocument(input: ResumeDocumentInput) {
    const title = input.title.trim() || "未命名简历";
    const targetRole = input.targetRole.trim() || "未标注岗位";
    const template =
      resumeTemplates.value.find((item) => item.id === input.templateId) ?? resumeTemplates.value[0];
    const content = input.content.trim();
    if (!content) throw new Error("简历内容不能为空");
    return {
      title,
      targetRole,
      templateId: template.id,
      content,
      source: input.source ?? "manual",
      fileName: input.fileName?.trim() || undefined,
      changeNote: input.changeNote?.trim() || "未记录版本说明"
    };
  }

  function importResumeDocument(input: ResumeDocumentInput) {
    const document = normalizeResumeDocument(input);
    const { title, targetRole, ...versionFields } = document;
    const version: ResumeVersion = {
      id: resumeVersionId++,
      version: 1,
      status: "final",
      updatedAt: "刚刚",
      ...versionFields
    };
    const imported: ResumeDocument = {
      id: resumeDocumentId++,
      title,
      targetRole,
      activeVersionId: version.id,
      versions: [version]
    };
    resumeDocuments.value.unshift(imported);
    addTrace(
      "成品简历导入",
      imported.versions[0].fileName ?? imported.title,
      "浏览器读取本机文件建立索引，未上传简历全文"
    );
    return imported;
  }

  function createResumeDraft(
    documentId: number,
    baseVersionId: number,
    input: ResumeDocumentInput
  ) {
    const resume = resumeDocuments.value.find((item) => item.id === documentId);
    if (!resume) throw new Error("简历不存在");
    const existingDraft = resume.versions.find((item) => item.status === "draft");
    if (existingDraft) return existingDraft;

    const base = resume.versions.find((item) => item.id === baseVersionId);
    if (!base) throw new Error("基准版本不存在");
    const document = normalizeResumeDocument({
      ...input,
      title: input.title || resume.title,
      targetRole: input.targetRole || resume.targetRole,
      templateId: input.templateId || base.templateId,
      content: input.content || base.content,
      source: input.source ?? "manual",
      fileName: input.fileName ?? base.fileName,
      changeNote: input.changeNote ?? `从 v${base.version} 派生`
    });
    const { title, targetRole, ...versionFields } = document;
    const draft: ResumeVersion = {
      id: resumeVersionId++,
      version: Math.max(...resume.versions.map((item) => item.version)) + 1,
      status: "draft",
      updatedAt: "刚刚",
      ...versionFields
    };
    resume.title = title;
    resume.targetRole = targetRole;
    resume.versions.push(draft);
    addTrace(
      "简历草稿派生",
      resume.title,
      `从 v${base.version} 派生 v${draft.version}，定稿版本保持只读`
    );
    return draft;
  }

  function updateResumeDraft(
    documentId: number,
    versionId: number,
    patch: ResumeDocumentInput
  ) {
    const resume = resumeDocuments.value.find((item) => item.id === documentId);
    const version = resume?.versions.find((item) => item.id === versionId);
    if (!resume || !version) throw new Error("简历版本不存在");
    if (version.status !== "draft") throw new Error("定稿和已导出版本不可直接覆盖");

    const document = normalizeResumeDocument({
      ...patch,
      source: patch.source ?? version.source,
      fileName: patch.fileName ?? version.fileName
    });
    const { title, targetRole, ...versionFields } = document;
    Object.assign(version, versionFields, {
      updatedAt: "刚刚"
    });
    resume.title = title;
    resume.targetRole = targetRole;
    addTrace(
      "简历草稿保存",
      resume.title,
      `v${version.version} 保持草稿态，模板只影响版式，不改写简历事实`
    );
    return version;
  }

  function finalizeResumeVersion(documentId: number, versionId: number) {
    const resume = resumeDocuments.value.find((item) => item.id === documentId);
    const version = resume?.versions.find((item) => item.id === versionId);
    if (!resume || !version) return;
    if (version.status !== "draft") return;

    version.status = "final";
    version.updatedAt = "刚刚";
    resume.activeVersionId = version.id;
    addTrace(
      "简历版本定稿",
      resume.title,
      `v${version.version} 由用户确认定稿，并设为当前投递版`
    );
  }

  function markResumeVersionExported(documentId: number, versionId: number) {
    const resume = resumeDocuments.value.find((item) => item.id === documentId);
    const version = resume?.versions.find((item) => item.id === versionId);
    if (!resume || !version || version.status !== "final") return;

    version.status = "exported";
    version.updatedAt = "刚刚";
    resume.activeVersionId = version.id;
    addTrace(
      "简历版本导出",
      resume.title,
      `v${version.version} 标记为已导出，内容保持只读`
    );
  }

  function setActiveResumeVersion(documentId: number, versionId: number) {
    const resume = resumeDocuments.value.find((item) => item.id === documentId);
    const version = resume?.versions.find((item) => item.id === versionId);
    if (!resume || !version || version.status === "draft") return;
    if (resume.activeVersionId === versionId) return;

    resume.activeVersionId = version.id;
    addTrace(
      "当前投递版切换",
      resume.title,
      `切换到 v${version.version}，草稿不能作为投递版`
    );
  }

  function setProcessStageStatus(
    opportunityId: number,
    stageId: number,
    status: Exclude<ProcessStageStatus, "offer">
  ) {
    const opportunity = opportunities.value.find((item) => item.id === opportunityId);
    const stage = opportunity?.stages.find((item) => item.id === stageId);
    if (!opportunity || !stage) return;

    stage.status = status;
    addTrace(
      "面试流程状态更新",
      `${opportunity.company} · ${stage.name}`,
      `用户手工标记为${processStatusLabel(status)}，Agent 不自动改写结果`
    );
  }

  function markProcessStageOffer(opportunityId: number, stageId: number) {
    const opportunity = opportunities.value.find((item) => item.id === opportunityId);
    const stage = opportunity?.stages.find((item) => item.id === stageId);
    if (!opportunity || !stage) return;

    stage.status = "offer";
    stage.encouragement = "Offer 拿下了，这一路的每一步都算数。";
    addTrace(
      "Offer 确认",
      `${opportunity.company} · ${stage.name}`,
      "用户手工确认 Offer，流程树进入成功终端节点"
    );
  }

  function addProcessStage(opportunityId: number, name: string) {
    const opportunity = opportunities.value.find((item) => item.id === opportunityId);
    const stageName = name.trim();
    if (!opportunity || !stageName) return;

    opportunity.stages.push({
      id: processStageId++,
      name: stageName,
      status: "todo",
      note: "人工添加的节点，可按实际情况补充说明",
      skillKey: "agent-assist",
      skillName: "Agent 协助",
      encouragement: "流程树跟着真实情况走，不用硬套模板。"
    });
    addTrace(
      "面试流程节点新增",
      `${opportunity.company} · ${stageName}`,
      "用户手工添加节点，适配不固定的面试轮次"
    );
  }

  function moveProcessStage(opportunityId: number, stageId: number, targetIndex: number) {
    const opportunity = opportunities.value.find((item) => item.id === opportunityId);
    const fromIndex = opportunity?.stages.findIndex((item) => item.id === stageId) ?? -1;
    if (!opportunity || fromIndex < 0) return;

    const clampedIndex = Math.max(0, Math.min(targetIndex, opportunity.stages.length - 1));
    if (fromIndex === clampedIndex) return;

    const [stage] = opportunity.stages.splice(fromIndex, 1);
    opportunity.stages.splice(clampedIndex, 0, stage);
    addTrace(
      "面试流程节点排序",
      `${opportunity.company} · ${stage.name}`,
      "用户手工调整节点顺序，节点状态和产物信息保持不变"
    );
  }

  function processStatusLabel(status: ProcessStageStatus) {
    return (
      {
        todo: "待开始",
        active: "进行中",
        waiting: "等待中",
        passed: "已通过",
        failed: "未通过",
        offer: "Offer"
      })[status];
  }

  function confirmSync(item: CompanyOpportunity) {
    opportunities.value = opportunities.value.map((opportunity) =>
      opportunity.id === item.id ? { ...opportunity, synced: true } : opportunity
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
    activeDevices,
    pendingDevices,
    bindingState,
    deviceCode,
    deviceCodeExpiresAt,
    deviceError,
    deviceBusy,
    devicesInitialized,
    primaryDevice,
    evidenceVersion,
    evidenceTime,
    lastSyncTime,
    input,
    sending,
    activeIntent,
    evidenceAbilities,
    resumeDocuments,
    resumeVersions,
    resumeTemplates,
    resumeStatusCount,
    careerStages,
    opportunities,
    traceEvents,
    messages,
    bindingLabel,
    connectCommand,
    latestTrace,
    addTrace,
    initializeDevices,
    refreshDevices,
    stopDevicePolling,
    generateDeviceCode,
    unbind,
    formatDeviceTime,
    submitMessage,
    confirmSkillPlan,
    rejectSkillPlan,
    skillPlanStatusLabel,
    detectIntent,
    importResumeDocument,
    createResumeDraft,
    updateResumeDraft,
    finalizeResumeVersion,
    markResumeVersionExported,
    setActiveResumeVersion,
    setProcessStageStatus,
    markProcessStageOffer,
    addProcessStage,
    moveProcessStage,
    processStatusLabel,
    confirmSync
  };
});
