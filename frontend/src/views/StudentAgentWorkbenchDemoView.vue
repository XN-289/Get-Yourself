<script setup lang="ts">
import {
  ArrowRight,
  Bot,
  Check,
  CircleCheck,
  Copy,
  FileText,
  FolderTree,
  KeyRound,
  ListChecks,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2
} from "@lucide/vue";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

type BindingState = "unbound" | "pending" | "bound";
type ChatRole = "assistant" | "system" | "user";
type FocusModule = "assets" | "resume" | "interview";
type WorkbenchIntent =
  | "experience"
  | "assets"
  | "resume"
  | "evaluation"
  | "interview"
  | "review"
  | "plan";

interface ChatMessage {
  id: number;
  role: ChatRole;
  title: string;
  lines: string[];
  tags: string[];
}

interface EvidenceAbility {
  id: number;
  name: string;
  score: string;
  evidence: string;
  source: "growth" | "interview" | "jd";
}

interface ResumeFact {
  id: number;
  label: string;
  source: string;
  confirmed: boolean;
}

interface ResumeAsset {
  id: number;
  name: string;
  version: string;
  status: string;
  coverage: string;
}

interface InterviewStage {
  id: number;
  name: string;
  state: "done" | "current" | "todo";
  note: string;
}

interface ApplicationItem {
  id: number;
  company: string;
  role: string;
  stage: string;
  nextAction: string;
  synced: boolean;
}

interface TraceItem {
  id: number;
  title: string;
  source: string;
  result: string;
}

interface CareerStage {
  id: string;
  title: string;
  period: string;
  status: "structured" | "delivering" | "practicing" | "feeding-back";
  summary: string;
  artifacts: string[];
}

const route = useRoute();
const router = useRouter();

const activeFocus = ref<FocusModule>("assets");
const bindingState = ref<BindingState>("unbound");
const deviceCode = ref("");
const copied = ref(false);
const evidenceVersion = ref("未导入");
const evidenceTime = ref("");
const input = ref("");
const sending = ref(false);
const activeIntent = ref<WorkbenchIntent>("experience");
const selectedStageId = ref("asset");
const syncCandidate = ref<ApplicationItem | null>(null);
const unbindOpen = ref(false);
const lastSyncTime = ref("");
const messageStream = ref<HTMLElement | null>(null);
let messageId = 1;
let traceId = 3;
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const focusModules = [
  { id: "assets" as const, label: "能力资产", icon: ShieldCheck },
  { id: "resume" as const, label: "简历管理", icon: FileText },
  { id: "interview" as const, label: "面试管理", icon: ListChecks }
];

const quickPrompts = [
  { intent: "experience" as const, label: "整理成长经历" },
  { intent: "resume" as const, label: "生成简历条目" },
  { intent: "interview" as const, label: "准备明天面试" },
  { intent: "review" as const, label: "复盘并反哺资产" }
];

const careerStages = ref<CareerStage[]>([
  {
    id: "explore",
    title: "探索期",
    period: "大二",
    status: "structured",
    summary: "宿舍报修小程序从想法走向宿舍试用。",
    artifacts: ["项目记录", "接口联调记录"]
  },
  {
    id: "asset",
    title: "能力资产化",
    period: "大三上",
    status: "structured",
    summary: "把经历拆成可复用证据，而不是一次性日记。",
    artifacts: ["后端开发 78", "工程协作 71", "问题定位 66"]
  },
  {
    id: "resume",
    title: "简历交付",
    period: "秋招",
    status: "delivering",
    summary: "同一份能力资产生成多个岗位版本。",
    artifacts: ["Java 后端 v3", "前端实习 v2"]
  },
  {
    id: "practice",
    title: "投递与面试",
    period: "进行中",
    status: "practicing",
    summary: "真实市场反馈进入面试流程，而不是停留在自我评价。",
    artifacts: ["星野科技笔试", "远山数据一面"]
  },
  {
    id: "feedback",
    title: "复盘反哺",
    period: "下一次投递前",
    status: "feeding-back",
    summary: "面试追问和 JD 差距回写到能力资产。",
    artifacts: ["接口权限 STAR", "分布式学习任务"]
  }
]);

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
    id: messageId++,
    role: "assistant",
    title: "GY Agent",
    lines: [
      "我是你的求职执行入口。你不需要先决定去哪个模块，直接说要整理经历、改简历、准备面试或复盘。",
      "我会把动作落到右侧对象：能力资产、简历管理、面试管理，并保留每一步 Trace。"
    ],
    tags: ["Agent 优先", "求职闭环"]
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
const selectedStage = computed(
  () => careerStages.value.find((stage) => stage.id === selectedStageId.value) ?? careerStages.value[1]
);
const confirmedFactCount = computed(() => resumeDraft.facts.filter((fact) => fact.confirmed).length);
const connectCommand = computed(() => (deviceCode.value ? `gy connect ${deviceCode.value}` : ""));
const focusLabel = computed(
  () =>
    ({
      assets: "能力资产",
      resume: "简历管理",
      interview: "面试管理"
    })[activeFocus.value]
);

watch(
  () => route.query.focus,
  (value) => {
    activeFocus.value = normalizeFocus(value);
  },
  { immediate: true }
);

function normalizeFocus(value: unknown): FocusModule {
  return value === "resume" || value === "interview" ? value : "assets";
}

async function setFocus(focus: FocusModule) {
  activeFocus.value = focus;
  if (route.query.focus !== focus) {
    await router.replace({ query: { ...route.query, focus } });
  }
}

function generateDeviceCode() {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  deviceCode.value = `GY-${suffix}`;
  bindingState.value = "pending";
  copied.value = false;
}

async function copyConnectCommand() {
  if (!connectCommand.value) return;
  try {
    await navigator.clipboard.writeText(connectCommand.value);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied.value = false), 2000);
  } catch {
    copied.value = false;
  }
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

function askUnbind() {
  unbindOpen.value = true;
}

function confirmUnbind() {
  unbindOpen.value = false;
  bindingState.value = "unbound";
  deviceCode.value = "";
  evidenceVersion.value = "未导入";
  evidenceTime.value = "";
  evidenceAbilities.value = [];
  lastSyncTime.value = "";
  applications.value = applications.value.map((item) => ({ ...item, synced: false }));
  pushMessage(
    "system",
    "设备已解绑",
    ["同步授权已失效，本地产物不会被删除。", "可以重新生成绑定码连接这台或另一台设备。"],
    ["授权撤销", "本地保留"]
  );
  addTrace("设备解绑", "网页端用户操作", "云端摘要连接断开，本地文件保留");
}

function selectQuickPrompt(prompt: (typeof quickPrompts)[number]) {
  const text = {
    experience: "把我大二做宿舍报修小程序的经历整理成能力资产。",
    resume: "把能力资产转成 Java 后端简历条目，并标出待确认事实。",
    interview: "明天下午远山数据一面，帮我按完整面试流程准备。",
    review: "我刚才被追问接口权限设计，帮我复盘并反哺能力资产。"
  }[prompt.intent];
  void sendMessage(text);
}

async function sendMessage(submitted = input.value) {
  const text = submitted.trim();
  if (!text || sending.value) return;
  input.value = "";
  activeIntent.value = detectIntent(text);
  pushMessage("user", "我", [text], []);
  sending.value = true;
  await new Promise((resolve) => setTimeout(resolve, 480));
  const response = buildResponse(activeIntent.value);
  pushMessage("assistant", response.title, response.lines, response.tags);
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
        "机会信号：校招完整培养周期，业务方向与已有项目相邻。",
        "风险信号：岗位描述未写工作地点，需要补充确认。",
        "建议：暂缓投递，先补齐城市与转正信息。"
      ],
      tags: ["规则复核", "本地报告"],
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
        "我会把面试后的回答转成复盘证据，再回写能力资产。"
      ],
      tags: ["STAR 草稿", "流程闭环"],
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
        "学习任务：补一个简单权限模型，并记录测试结果。",
        "该证据会标记来源为面试复盘，不会覆盖原始成长记录。"
      ],
      tags: ["面试来源", "资产更新"],
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
        "周五前：把远山数据一面复盘成一条可复用 STAR 故事。",
        "可暂缓：重做简历视觉模板，当前先补事实和结果。"
      ],
      tags: ["少量行动", "说明原因"],
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
      traceTitle: "能力资产结构化",
      traceSource: "成长记录 + 用户口述",
      traceResult: "生成候选证据，保留原经历链接"
    };
  }
  return {
    title: "成长经历整理",
    lines: [
      "我先把这个经历挂到职业成长树的探索期，再提取可复用能力资产。",
      "已识别项目交付、跨端协作、真实使用三个结构化维度。",
      "下一步可以生成简历条目，或者等你补充结果数据后再生成。"
    ],
    tags: ["成长树", "证据驱动"],
    traceTitle: "成长经历入树",
    traceSource: "用户口述 + 平台成长记录",
    traceResult: "更新职业成长主线与候选能力证据"
  };
}

function applyIntent(intent: WorkbenchIntent) {
  if (intent === "experience" || intent === "assets") {
    selectedStageId.value = "asset";
    void setFocus("assets");
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
    selectedStageId.value = "resume";
    void setFocus("resume");
    resumeDraft.bullet =
      "宿舍报修小程序：独立完成前后端开发，协作完成接口联调，系统已进入宿舍试用。";
    return;
  }
  if (intent === "evaluation" || intent === "interview") {
    selectedStageId.value = "practice";
    void setFocus("interview");
    return;
  }
  if (intent === "review") {
    selectedStageId.value = "feedback";
    void setFocus("assets");
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
    return;
  }
  selectedStageId.value = "practice";
  void setFocus("interview");
}

function selectStage(stage: CareerStage) {
  selectedStageId.value = stage.id;
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

function openSync(item: ApplicationItem) {
  if (bindingState.value !== "bound") return;
  syncCandidate.value = item;
}

function confirmSync() {
  if (!syncCandidate.value) return;
  applications.value = applications.value.map((item) =>
    item.id === syncCandidate.value?.id ? { ...item, synced: true } : item
  );
  lastSyncTime.value = "刚刚";
  addTrace(
    "求职摘要同步",
    `本地面试管理：${syncCandidate.value.company}`,
    "仅同步公司、岗位、阶段和下一步，未上传报告全文"
  );
  syncCandidate.value = null;
}

function pushMessage(role: ChatRole, title: string, lines: string[], tags: string[]) {
  messages.value.push({ id: messageId++, role, title, lines, tags });
  void nextTick(() => {
    messageStream.value?.scrollTo({
      top: messageStream.value.scrollHeight,
      behavior: "smooth"
    });
  });
}

function addTrace(title: string, source: string, result: string) {
  traceEvents.value.unshift({ id: traceId++, title, source, result });
}
</script>

<template>
  <section class="agent-workbench">
    <header class="workbench-header">
      <div>
        <p class="eyebrow">Agent Workbench</p>
        <h2>Agent 求职工作台</h2>
        <p>Agent 是唯一入口；能力资产、简历和面试是它操作的三个对象。</p>
      </div>
      <div class="header-loop">
        <span>能力资产</span>
        <ArrowRight :size="15" />
        <span>简历交付</span>
        <ArrowRight :size="15" />
        <span>面试实践</span>
        <Repeat :size="15" />
      </div>
    </header>

    <section class="agent-layout">
      <section class="agent-panel" aria-label="Agent 对话入口">
        <header class="agent-panel-header">
          <div class="agent-identity">
            <span class="agent-avatar"><Bot :size="24" /></span>
            <div>
              <strong>GY Agent</strong>
              <small>{{ bindingState === "bound" ? evidenceVersion : "local-only" }}</small>
            </div>
          </div>
          <div class="binding-strip" :class="`is-${bindingState}`">
            <MonitorSmartphone :size="16" />
            <span>{{ bindingLabel }}</span>
          </div>
        </header>

        <div class="binding-row">
          <template v-if="bindingState === 'unbound'">
            <p>绑定后 Agent 可读取网页能力证据摘要。</p>
            <button type="button" @click="generateDeviceCode">
              <KeyRound :size="16" />
              生成绑定码
            </button>
          </template>
          <template v-else-if="bindingState === 'pending'">
            <code>{{ connectCommand }}</code>
            <button type="button" @click="copyConnectCommand">
              <Check v-if="copied" :size="16" />
              <Copy v-else :size="16" />
              {{ copied ? "已复制" : "复制" }}
            </button>
            <button class="primary-tool" type="button" @click="confirmBinding">
              <Check :size="16" />
              模拟本地确认
            </button>
          </template>
          <template v-else>
            <p>证据包 {{ evidenceTime }}导入，敏感原文留在本机。</p>
            <button type="button" @click="generateDeviceCode">
              <RefreshCw :size="16" />
              重发
            </button>
            <button class="danger-tool" type="button" @click="askUnbind">
              <Trash2 :size="16" />
              解绑
            </button>
          </template>
        </div>

        <div ref="messageStream" class="message-stream">
          <article v-for="message in messages" :key="message.id" :class="`is-${message.role}`">
            <header>
              <strong>{{ message.title }}</strong>
              <span v-if="message.tags.length">{{ message.tags.join(" · ") }}</span>
            </header>
            <p v-for="(line, index) in message.lines" :key="index">{{ line }}</p>
          </article>
          <article v-if="sending" class="is-assistant is-loading">
            <header>
              <strong>GY Agent</strong>
              <span>正在处理</span>
            </header>
            <p><LoaderCircle class="spin" :size="16" /> 正在调用求职流程...</p>
          </article>
        </div>

        <div class="quick-prompts" aria-label="常用求职任务">
          <button
            v-for="prompt in quickPrompts"
            :key="prompt.intent"
            type="button"
            :class="{ 'is-active': activeIntent === prompt.intent && !sending }"
            :disabled="sending"
            @click="selectQuickPrompt(prompt)"
          >
            {{ prompt.label }}
          </button>
        </div>

        <form class="message-composer" @submit.prevent="sendMessage()">
          <textarea
            v-model="input"
            rows="3"
            maxlength="1200"
            placeholder="直接告诉 Agent：整理经历、改简历、准备面试、复盘被追问的问题"
            :disabled="sending"
          ></textarea>
          <button type="submit" :disabled="sending || !input.trim()" title="发送">
            <Send v-if="!sending" :size="19" />
            <LoaderCircle v-else class="spin" :size="19" />
          </button>
        </form>
      </section>

      <aside class="workbench-objects">
        <section class="object-panel growth-panel">
          <header>
            <div>
              <p class="eyebrow">Career Tree</p>
              <h3>职业成长树</h3>
            </div>
            <FolderTree :size="19" />
          </header>
          <p class="tree-principle">成长经历可以非线性；求职主线按资产、交付、实践、反哺推进。</p>
          <div class="growth-tree">
            <button
              v-for="stage in careerStages"
              :key="stage.id"
              type="button"
              :class="{ 'is-selected': selectedStageId === stage.id }"
              @click="selectStage(stage)"
            >
              <span class="stage-marker" :class="`is-${stage.status}`"></span>
              <span>
                <strong>{{ stage.title }}</strong>
                <small>{{ stage.period }} · {{ stage.summary }}</small>
              </span>
            </button>
          </div>
          <div class="stage-detail">
            <strong>{{ selectedStage.title }}的产物</strong>
            <div>
              <span v-for="artifact in selectedStage.artifacts" :key="artifact">{{ artifact }}</span>
            </div>
          </div>
        </section>

        <section class="object-panel focus-panel">
          <header>
            <div>
              <p class="eyebrow">Work Objects</p>
              <h3>{{ focusLabel }}</h3>
            </div>
            <component :is="focusModules.find((module) => module.id === activeFocus)?.icon" :size="19" />
          </header>

          <nav class="focus-tabs" aria-label="工作对象">
            <button
              v-for="module in focusModules"
              :key="module.id"
              type="button"
              :class="{ 'is-active': activeFocus === module.id }"
              @click="setFocus(module.id)"
            >
              <component :is="module.icon" :size="16" />
              {{ module.label }}
            </button>
          </nav>

          <div v-if="activeFocus === 'assets'" class="asset-view">
            <div v-if="!evidenceAbilities.length" class="empty-state">
              <ShieldCheck :size="24" />
              <p>先绑定本地工位，Agent 才能读取能力证据摘要。</p>
            </div>
            <template v-else>
              <article v-for="ability in evidenceAbilities" :key="ability.id" class="asset-card">
                <div>
                  <strong>{{ ability.name }}</strong>
                  <small>{{ ability.evidence }}</small>
                </div>
                <span>{{ ability.score }}</span>
                <em>{{ ability.source === "interview" ? "面试反哺" : ability.source === "jd" ? "JD 差距" : "成长记录" }}</em>
              </article>
              <article class="feedback-source">
                <Repeat :size="17" />
                <span>面试复盘与 JD 差距会作为候选证据进入这里，用户确认后参与评分。</span>
              </article>
            </template>
          </div>

          <div v-else-if="activeFocus === 'resume'" class="resume-view">
            <article v-for="asset in resumeAssets" :key="asset.id" class="resume-version">
              <div>
                <strong>{{ asset.name }} {{ asset.version }}</strong>
                <small>{{ asset.coverage }}</small>
              </div>
              <span :class="{ 'is-locked': asset.status === '已锁定' }">{{ asset.status }}</span>
            </article>
            <article class="resume-draft">
              <header>
                <strong>候选简历条目</strong>
                <span>{{ confirmedFactCount }} / {{ resumeDraft.facts.length }} 事实已确认</span>
              </header>
              <p>{{ resumeDraft.bullet }}</p>
              <ul>
                <li v-for="fact in resumeDraft.facts" :key="fact.id">
                  <span>{{ fact.label }} · {{ fact.source }}</span>
                  <button v-if="!fact.confirmed" type="button" @click="confirmResumeFact(fact.id)">
                    确认
                  </button>
                  <CircleCheck v-else :size="16" />
                </li>
              </ul>
            </article>
          </div>

          <div v-else class="interview-view">
            <ol class="interview-pipeline">
              <li v-for="stage in interviewStages" :key="stage.id" :class="`is-${stage.state}`">
                <span></span>
                <div>
                  <strong>{{ stage.name }}</strong>
                  <small>{{ stage.note }}</small>
                </div>
              </li>
            </ol>
            <div class="application-list">
              <article v-for="item in applications" :key="item.id">
                <div>
                  <strong>{{ item.company }}</strong>
                  <small>{{ item.role }}</small>
                  <span>{{ item.nextAction }}</span>
                </div>
                <div>
                  <em>{{ item.stage }}</em>
                  <CircleCheck v-if="item.synced" :size="16" />
                  <button v-else type="button" :disabled="bindingState !== 'bound'" @click="openSync(item)">
                    同步
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>
      </aside>
    </section>

    <section class="trace-panel">
      <header>
        <div>
          <p class="eyebrow">Agent Trace</p>
          <h3>决策链摘要</h3>
        </div>
        <Sparkles :size="19" />
      </header>
      <div>
        <article v-for="event in traceEvents.slice(0, 4)" :key="event.id">
          <strong>{{ event.title }}</strong>
          <p>{{ event.source }}</p>
          <small>{{ event.result }}</small>
        </article>
      </div>
    </section>

    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="syncCandidate" class="confirm-layer" @click.self="syncCandidate = null">
          <section class="confirm-dialog" role="dialog" aria-modal="true" aria-label="确认同步求职摘要">
            <header>
              <div>
                <p class="eyebrow">Outbound Sync</p>
                <h3>同步求职摘要</h3>
              </div>
              <ShieldCheck :size="21" />
            </header>
            <p>
              将同步 {{ syncCandidate.company }} · {{ syncCandidate.role }} 的公司、岗位、阶段和下一步。
              岗位评估报告全文、简历全文和本地备注不会上传。
            </p>
            <footer>
              <button class="ghost-button" type="button" @click="syncCandidate = null">取消</button>
              <button class="primary-button" type="button" @click="confirmSync">
                <ArrowRight :size="17" />
                确认同步
              </button>
            </footer>
          </section>
        </div>
      </Transition>

      <Transition name="overlay">
        <div v-if="unbindOpen" class="confirm-layer" @click.self="unbindOpen = false">
          <section class="confirm-dialog" role="dialog" aria-modal="true" aria-label="确认解绑设备">
            <header>
              <div>
                <p class="eyebrow">Revoke Device</p>
                <h3>解绑本地设备</h3>
              </div>
              <Trash2 :size="21" />
            </header>
            <p>解绑后云端停止接收这台设备的摘要，本地简历、报告和投递明细会保留。</p>
            <footer>
              <button class="ghost-button" type="button" @click="unbindOpen = false">取消</button>
              <button class="danger-button" type="button" @click="confirmUnbind">确认解绑</button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.agent-workbench {
  width: min(1360px, 100%);
  display: grid;
  gap: 14px;
  margin: 0 auto;
}

.workbench-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.workbench-header h2,
.object-panel h3,
.trace-panel h3,
.confirm-dialog h3 {
  margin: 3px 0 0;
  color: var(--ink);
}

.workbench-header h2 {
  font-size: clamp(25px, 3vw, 34px);
}

.workbench-header > div:first-child > p:last-child {
  margin: 7px 0 0;
  color: var(--muted);
  line-height: 1.6;
}

.header-loop {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.header-loop svg {
  color: var(--teal);
}

.agent-layout {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.22fr) minmax(370px, 0.78fr);
  gap: 14px;
  align-items: start;
}

.agent-panel {
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  border: 1px solid #263a3d;
  border-radius: 8px;
  background: #172124;
  box-shadow: 0 20px 54px rgba(23, 33, 36, 0.16);
  overflow: hidden;
}

.agent-panel-header {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #223336;
  color: #dcebe8;
}

.agent-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.agent-avatar {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(86, 191, 175, 0.2);
  color: #8fd6c8;
}

.agent-identity div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.agent-identity strong {
  font-size: 14px;
}

.agent-identity small {
  overflow: hidden;
  color: #9fb5b2;
  font-family: Consolas, "Courier New", monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.binding-strip {
  min-height: 34px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  color: #b9cbc8;
  font-size: 11px;
  font-weight: 900;
}

.binding-strip.is-bound {
  border-color: rgba(86, 191, 175, 0.46);
  background: rgba(20, 123, 115, 0.28);
  color: #b7e5da;
}

.binding-strip.is-pending {
  border-color: rgba(199, 144, 37, 0.48);
  background: rgba(199, 144, 37, 0.18);
  color: #f0d69b;
}

.binding-row {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 9px 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  background: #1c2c2f;
}

.binding-row p {
  min-width: 0;
  flex: 1;
  margin: 0;
  color: #a9c1be;
  font-size: 11px;
  line-height: 1.5;
}

.binding-row code {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  color: #dcebe8;
  font-size: 12px;
}

.binding-row button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.07);
  color: #dcebe8;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.binding-row .primary-tool {
  border-color: rgba(86, 191, 175, 0.62);
  background: rgba(20, 123, 115, 0.45);
}

.binding-row .danger-tool {
  border-color: rgba(223, 101, 79, 0.52);
  color: #f0b3a7;
}

.message-stream {
  min-height: 410px;
  max-height: min(560px, 56vh);
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 16px;
  overflow: auto;
}

.message-stream article {
  max-width: min(720px, 92%);
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
  color: #e8f0ef;
  line-height: 1.65;
}

.message-stream article.is-user {
  justify-self: end;
  border-color: rgba(20, 123, 115, 0.58);
  background: rgba(20, 123, 115, 0.25);
}

.message-stream article.is-system {
  border-color: rgba(199, 144, 37, 0.42);
  background: rgba(199, 144, 37, 0.14);
}

.message-stream header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.message-stream strong {
  font-size: 12px;
}

.message-stream header span {
  overflow: hidden;
  color: #a9c1be;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-stream p {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}

.message-stream .is-loading p {
  display: flex;
  align-items: center;
  gap: 7px;
}

.quick-prompts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  padding: 0 15px 11px;
}

.quick-prompts button {
  min-height: 37px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
  color: #d6e5e3;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.quick-prompts button:hover:not(:disabled),
.quick-prompts button.is-active {
  border-color: rgba(86, 191, 175, 0.7);
  background: rgba(20, 123, 115, 0.36);
  color: #fff;
}

.quick-prompts button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.message-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  gap: 8px;
  padding: 11px 15px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: #1d2e30;
}

.message-composer textarea {
  width: 100%;
  min-height: 58px;
  max-height: 130px;
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
  color: #eef5f4;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  outline: 0;
}

.message-composer textarea::placeholder {
  color: #91a8a6;
}

.message-composer textarea:focus-visible {
  border-color: rgba(86, 191, 175, 0.75);
}

.message-composer > button {
  width: 48px;
  min-height: 58px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: var(--teal);
  color: #fff;
  cursor: pointer;
}

.message-composer > button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.workbench-objects {
  min-width: 0;
  display: grid;
  gap: 12px;
}

.object-panel {
  display: grid;
  gap: 12px;
  padding: 17px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.object-panel > header,
.trace-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.object-panel > header > div,
.trace-panel > header > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.object-panel > header > svg,
.trace-panel > header > svg {
  color: var(--teal);
}

.object-panel h3,
.trace-panel h3 {
  font-size: 18px;
}

.tree-principle {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.growth-tree {
  display: grid;
  gap: 7px;
}

.growth-tree button {
  position: relative;
  min-height: 58px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.growth-tree button::after {
  content: "";
  position: absolute;
  top: 33px;
  bottom: -8px;
  left: 18px;
  width: 2px;
  background: var(--line);
}

.growth-tree button:last-child::after {
  display: none;
}

.growth-tree button.is-selected {
  border-color: rgba(20, 123, 115, 0.42);
  background: #e8f6f1;
}

.stage-marker {
  width: 10px;
  height: 10px;
  border: 3px solid #b9c3c1;
  border-radius: 50%;
  background: #fff;
}

.stage-marker.is-structured {
  border-color: var(--teal);
}

.stage-marker.is-delivering {
  border-color: var(--blue);
}

.stage-marker.is-practicing {
  border-color: var(--coral);
}

.stage-marker.is-feeding-back {
  border-color: var(--gold);
}

.growth-tree strong {
  display: block;
  font-size: 13px;
}

.growth-tree small {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.stage-detail {
  display: grid;
  gap: 8px;
  padding: 11px;
  border-left: 3px solid var(--teal);
  border-radius: 6px;
  background: var(--surface-soft);
}

.stage-detail strong {
  font-size: 12px;
}

.stage-detail div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stage-detail span {
  padding: 4px 7px;
  border: 1px solid rgba(20, 123, 115, 0.18);
  border-radius: 5px;
  background: #fff;
  color: var(--teal-dark);
  font-size: 11px;
  font-weight: 800;
}

.focus-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.focus-tabs button {
  min-height: 39px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.focus-tabs button.is-active {
  border-color: rgba(20, 123, 115, 0.42);
  background: #e8f6f1;
  color: var(--teal-dark);
}

.empty-state {
  min-height: 128px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 9px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
  color: var(--muted);
  text-align: center;
}

.empty-state p {
  max-width: 250px;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.empty-state svg {
  color: var(--teal);
}

.asset-view,
.resume-view,
.interview-view {
  display: grid;
  gap: 8px;
}

.asset-card,
.resume-version,
.application-list article,
.trace-panel article {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
}

.asset-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 10px;
  padding: 11px;
}

.asset-card div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.asset-card strong {
  font-size: 13px;
}

.asset-card small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.asset-card > span {
  color: var(--teal-dark);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.asset-card em {
  justify-self: start;
  padding: 3px 6px;
  border-radius: 5px;
  background: #e8f6f1;
  color: var(--teal-dark);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
}

.feedback-source {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-left: 3px solid var(--gold);
  border-radius: 6px;
  background: #fffaf0;
  color: #755916;
  font-size: 11px;
  line-height: 1.55;
}

.feedback-source svg {
  flex: 0 0 auto;
  color: var(--gold);
}

.resume-version {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px;
}

.resume-version div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.resume-version strong {
  font-size: 13px;
}

.resume-version small {
  color: var(--muted);
  font-size: 11px;
}

.resume-version span {
  padding: 4px 6px;
  border-radius: 5px;
  background: #fff5df;
  color: #876015;
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
}

.resume-version span.is-locked {
  background: #e8f6f1;
  color: var(--teal-dark);
}

.resume-draft {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(20, 123, 115, 0.2);
  border-radius: 7px;
  background: #f5fbf9;
}

.resume-draft header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.resume-draft header strong {
  font-size: 12px;
}

.resume-draft header span {
  color: var(--teal-dark);
  font-size: 11px;
  font-weight: 900;
}

.resume-draft > p {
  margin: 0;
  color: #334143;
  font-size: 12px;
  line-height: 1.65;
}

.resume-draft ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.resume-draft li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
}

.resume-draft li span {
  min-width: 0;
}

.resume-draft li svg {
  color: var(--teal);
}

.resume-draft li button {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(20, 123, 115, 0.24);
  border-radius: 6px;
  background: #fff;
  color: var(--teal-dark);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.interview-pipeline {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.interview-pipeline li {
  position: relative;
  min-height: 47px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.interview-pipeline li::before {
  content: "";
  position: absolute;
  top: 20px;
  bottom: -14px;
  left: 8px;
  width: 2px;
  background: var(--line);
}

.interview-pipeline li:last-child::before {
  display: none;
}

.interview-pipeline span {
  width: 10px;
  height: 10px;
  border: 3px solid #c5cecc;
  border-radius: 50%;
  background: #fff;
}

.interview-pipeline li.is-done span {
  border-color: var(--teal);
  background: var(--teal);
}

.interview-pipeline li.is-current span {
  border-color: var(--coral);
  box-shadow: 0 0 0 4px rgba(223, 101, 79, 0.14);
}

.interview-pipeline div {
  min-width: 0;
  display: grid;
  gap: 2px;
  padding: 6px 0;
}

.interview-pipeline strong {
  font-size: 12px;
}

.interview-pipeline small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.application-list {
  display: grid;
  gap: 7px;
}

.application-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
}

.application-list article > div:first-child {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.application-list strong {
  font-size: 12px;
}

.application-list small {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.application-list article > div:first-child > span {
  color: #4d5a5e;
  font-size: 11px;
  line-height: 1.45;
}

.application-list article > div:last-child {
  display: grid;
  justify-items: center;
  gap: 5px;
}

.application-list em {
  padding: 3px 6px;
  border-radius: 5px;
  background: #e8f6f1;
  color: var(--teal-dark);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  white-space: nowrap;
}

.application-list svg {
  color: var(--teal);
}

.application-list button {
  min-height: 29px;
  padding: 0 9px;
  border: 1px solid rgba(20, 123, 115, 0.24);
  border-radius: 6px;
  background: #fff;
  color: var(--teal-dark);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.application-list button:disabled {
  border-color: var(--line);
  color: #a5adaf;
  cursor: not-allowed;
}

.trace-panel {
  display: grid;
  gap: 12px;
  padding: 17px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.trace-panel > div {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}

.trace-panel article {
  display: grid;
  gap: 5px;
  padding: 11px;
  border-left: 3px solid var(--blue);
}

.trace-panel strong {
  font-size: 12px;
}

.trace-panel p,
.trace-panel small {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
}

.confirm-layer {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(23, 33, 36, 0.46);
}

.confirm-dialog {
  width: min(480px, 100%);
  display: grid;
  gap: 17px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 28px 70px rgba(23, 33, 36, 0.28);
}

.confirm-dialog > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.confirm-dialog h3 {
  font-size: 21px;
}

.confirm-dialog > p {
  margin: 0;
  color: #4d5a5e;
  line-height: 1.7;
}

.confirm-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
}

.confirm-dialog footer button {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.primary-button {
  border: 1px solid var(--teal);
  background: var(--teal);
  color: #fff;
}

.ghost-button {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
}

.danger-button {
  border: 1px solid rgba(223, 101, 79, 0.42);
  background: #fff;
  color: #a2483b;
}

.primary-button:hover,
.ghost-button:hover,
.danger-button:hover {
  filter: brightness(0.97);
}

.spin {
  animation: workbenchSpin 1s linear infinite;
}

@keyframes workbenchSpin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .agent-layout {
    grid-template-columns: 1fr;
  }

  .trace-panel > div {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .workbench-header {
    display: grid;
    align-items: start;
    padding: 18px 15px;
  }

  .header-loop {
    overflow-x: auto;
    padding-bottom: 2px;
    white-space: nowrap;
  }

  .quick-prompts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .quick-prompts,
  .focus-tabs,
  .trace-panel > div {
    grid-template-columns: 1fr;
  }

  .message-stream {
    min-height: 370px;
    padding: 12px;
  }

  .message-stream article {
    max-width: 100%;
  }

  .agent-panel-header,
  .binding-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .binding-row {
    justify-items: stretch;
  }

  .binding-row button {
    width: 100%;
    justify-content: center;
  }

  .object-panel,
  .trace-panel,
  .confirm-dialog {
    padding: 15px 13px;
  }

  .asset-card,
  .resume-version,
  .application-list article {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .asset-card > span,
  .asset-card em,
  .resume-version span,
  .application-list article > div:last-child {
    justify-self: start;
  }

  .confirm-layer {
    align-items: end;
    padding: 0;
  }

  .confirm-dialog {
    width: 100%;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 8px 8px 0 0;
  }

  .confirm-dialog footer {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
