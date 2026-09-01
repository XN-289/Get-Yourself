<script setup lang="ts">
import {
  ArrowRight,
  Check,
  CircleCheck,
  ClipboardCheck,
  Copy,
  FileText,
  FolderLock,
  KeyRound,
  ListChecks,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2
} from "@lucide/vue";
import { computed, nextTick, reactive, ref } from "vue";

type BindingState = "unbound" | "pending" | "bound";
type ChatRole = "assistant" | "system" | "user";
type WorkbenchIntent = "experience" | "evaluation" | "interview" | "tracker" | "plan";

interface ChatMessage {
  id: number;
  role: ChatRole;
  title: string;
  lines: string[];
  tags: string[];
}

interface EvidenceAbility {
  name: string;
  score: string;
  evidence: string;
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

const bindingState = ref<BindingState>("unbound");
const deviceCode = ref("");
const copied = ref(false);
const evidenceVersion = ref("未导入");
const evidenceTime = ref("");
const input = ref("");
const sending = ref(false);
const activeIntent = ref<WorkbenchIntent>("experience");
const syncCandidate = ref<ApplicationItem | null>(null);
const unbindOpen = ref(false);
const messageStream = ref<HTMLElement | null>(null);
const lastSyncTime = ref("");
let messageId = 1;
let traceId = 3;
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const evidenceAbilities = ref<EvidenceAbility[]>([]);
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
    nextAction: "复盘项目提问，更新 STAR 故事",
    synced: false
  },
  {
    id: 3,
    company: "南风教育",
    role: "全栈开发实习生",
    stage: "待评估",
    nextAction: "补充 JD 后生成评估报告",
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
const drafts = reactive({
  resume: "",
  evaluation: "",
  story: ""
});
const messages = ref<ChatMessage[]>([
  {
    id: messageId++,
    role: "assistant",
    title: "Get Yourself 工位",
    lines: [
      "这里是你本地求职工位的网页摘要。",
      "先绑定设备并导入能力证据，再继续整理经历、评估岗位或准备面试。"
    ],
    tags: ["本地优先", "证据驱动"]
  }
]);

const quickPrompts = [
  { intent: "experience" as const, label: "整理实习经历" },
  { intent: "evaluation" as const, label: "评估校招岗位" },
  { intent: "interview" as const, label: "准备明天面试" },
  { intent: "plan" as const, label: "看这周优先级" }
];

const bindingLabel = computed(
  () =>
    ({
      unbound: "未绑定",
      pending: "待确认",
      bound: "已绑定"
    })[bindingState.value]
);
const activeApplications = computed(() => applications.value.filter((item) => item.stage !== "已结束"));
const syncedCount = computed(() => applications.value.filter((item) => item.synced).length);
const connectCommand = computed(() => (deviceCode.value ? `gy connect ${deviceCode.value}` : ""));

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
    { name: "后端开发", score: "78 / 100", evidence: "实习项目 + 挑战交付 + 课程设计" },
    { name: "工程协作", score: "71 / 100", evidence: "接口联调记录 + 团队复盘" },
    { name: "问题定位", score: "66 / 100", evidence: "线上问题复盘 + 测试通过记录" }
  ];
  pushMessage(
    "system",
    "绑定完成",
    [
      `设备已导入 ${evidenceVersion.value}。`,
      "简历全文、证书扫描件和面试逐字稿仍只保留在本机。"
    ],
    ["能力证据包", "最小下发"]
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
    experience: "我在大三做过一个宿舍报修小程序，负责前后端，怎么写进简历？",
    evaluation: "这个 Java 后端校招岗位值得投吗？",
    interview: "明天下午有面试，帮我准备三个会被追问的问题。",
    plan: "这周求职上最该做什么？"
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
  updateDraft(activeIntent.value);
  addTrace(response.traceTitle, response.traceSource, response.traceResult);
  sending.value = false;
}

function detectIntent(text: string): WorkbenchIntent {
  if (/岗位|公司|值得投|JD|jd/.test(text)) return "evaluation";
  if (/面试|笔试/.test(text)) return "interview";
  if (/进度|投递|跟进|状态/.test(text)) return "tracker";
  if (/这周|本周|计划|优先级/.test(text)) return "plan";
  return "experience";
}

function buildResponse(intent: WorkbenchIntent) {
  if (intent === "evaluation") {
    return {
      title: "岗位评估草稿",
      lines: [
        "匹配度 74%：Spring Boot、MySQL、接口联调有证据支持；分布式经验不足。",
        "机会信号：校招完整培养周期，业务方向与已有项目相邻。",
        "风险信号：岗位描述未写工作地点，需要补充确认。",
        "建议：暂缓投递，先补齐城市与转正信息；报告全文已保存在本地。"
      ],
      tags: ["规则复核", "本地报告"],
      traceTitle: "岗位评估生成",
      traceSource: "JD 文本 + 能力证据包",
      traceResult: "生成匹配度、风险与建议，未自动写入 tracker"
    };
  }
  if (intent === "interview") {
    return {
      title: "面试准备草稿",
      lines: [
        "项目追问：宿舍报修小程序的接口权限是如何设计的？",
        "协作追问：接口联调出现分歧时，你如何推进结论？",
        "结果追问：系统最终有多少人使用，故障率有没有下降？",
        "已关联后端开发、工程协作两项能力证据。"
      ],
      tags: ["STAR 草稿", "证据关联"],
      traceTitle: "面试问题生成",
      traceSource: "岗位评估 + 简历素材 + 能力证据",
      traceResult: "生成三个追问点和一份 STAR 草稿"
    };
  }
  if (intent === "tracker") {
    return {
      title: "投递进度摘要",
      lines: [
        `进行中 ${activeApplications.value.length} 个：星野科技笔试、远山数据一面、南风教育待评估。`,
        "今天必须处理：星野科技笔试材料确认。",
        "本周高价值：远山数据项目复盘沉淀 STAR 故事。"
      ],
      tags: ["确定性状态机", "本地权威"],
      traceTitle: "进度摘要读取",
      traceSource: "本地 applications 状态",
      traceResult: "只读取进度，不修改 tracker"
    };
  }
  if (intent === "plan") {
    return {
      title: "本周行动建议",
      lines: [
        "今天：确认星野科技笔试设备与时间。",
        "周三前：补充南风教育岗位城市和招聘批次。",
        "周五前：把远山数据一面复盘成一条可复用 STAR 故事。",
        "可暂缓：重做简历视觉模板，当前先补事实和结果。"
      ],
      tags: ["少量行动", "说明原因"],
      traceTitle: "周计划生成",
      traceSource: "投递状态 + 网页日程 + 能力差距",
      traceResult: "输出三优先级动作，不自动写入日程"
    };
  }
  return {
    title: "简历条目草稿",
    lines: [
      "独立完成宿舍报修小程序前后端开发，覆盖报修、派单与状态追踪流程。",
      "与同学协作完成接口联调，沉淀接口约定和联调记录；系统已在宿舍楼试用。",
      "待确认：使用人数、故障处理时长、你个人负责的模块边界。"
    ],
    tags: ["证据状态", "不编造结果"],
    traceTitle: "简历条目生成",
    traceSource: "用户口述 + 平台项目证据",
    traceResult: "生成一条候选 bullet，等待用户确认后写入素材库"
  };
}

function updateDraft(intent: WorkbenchIntent) {
  if (intent === "experience") {
    drafts.resume = "宿舍报修小程序：独立完成前后端开发，协作完成接口联调，系统已进入宿舍试用。";
  }
  if (intent === "evaluation") {
    drafts.evaluation = "Java 后端校招岗位：匹配度 74%，建议补充城市与转正信息后投递。";
  }
  if (intent === "interview") {
    drafts.story = "接口权限设计：从需求分歧到约定文档，最终完成联调并支撑宿舍试用。";
  }
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
    `本地 tracker：${syncCandidate.value.company}`,
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
  <section class="local-workbench-demo">
    <header class="workbench-header">
      <div>
        <p class="eyebrow">Local Workbench</p>
        <h2>本地求职工位</h2>
        <p>网页保存能力证据，本机生成简历、报告和面试材料。</p>
      </div>
      <div class="header-state" :class="`is-${bindingState}`">
        <MonitorSmartphone :size="19" />
        <span>{{ bindingLabel }}</span>
      </div>
    </header>

    <section class="workbench-metrics">
      <article>
        <MonitorSmartphone :size="19" />
        <div>
          <strong>{{ bindingLabel }}</strong>
          <small>设备授权</small>
        </div>
      </article>
      <article>
        <ShieldCheck :size="19" />
        <div>
          <strong>{{ evidenceVersion }}</strong>
          <small>{{ evidenceTime || "能力证据包" }}</small>
        </div>
      </article>
      <article>
        <ListChecks :size="19" />
        <div>
          <strong>{{ activeApplications.length }}</strong>
          <small>进行中投递</small>
        </div>
      </article>
      <article>
        <ClipboardCheck :size="19" />
        <div>
          <strong>{{ syncedCount }}</strong>
          <small>已确认同步</small>
        </div>
      </article>
    </section>

    <section class="workbench-layout">
      <section class="terminal-panel" aria-label="本地工作台对话">
        <header class="terminal-titlebar">
          <div class="terminal-dots" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div>
            <strong>gy workbench</strong>
            <small>{{ bindingState === "bound" ? evidenceVersion : "local-only" }}</small>
          </div>
          <Terminal :size="18" />
        </header>

        <div ref="messageStream" class="message-stream">
          <article
            v-for="message in messages"
            :key="message.id"
            :class="`is-${message.role}`"
          >
            <header>
              <strong>{{ message.title }}</strong>
              <span v-if="message.tags.length">{{ message.tags.join(" · ") }}</span>
            </header>
            <p v-for="(line, index) in message.lines" :key="index">{{ line }}</p>
          </article>
          <article v-if="sending" class="is-assistant is-loading">
            <header>
              <strong>Get Yourself 工位</strong>
              <span>正在处理</span>
            </header>
            <p><LoaderCircle class="spin" :size="16" /> 正在整理证据与规则...</p>
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
            placeholder="直接说你要处理的求职任务"
            :disabled="sending"
          ></textarea>
          <button type="submit" :disabled="sending || !input.trim()" title="发送">
            <Send v-if="!sending" :size="19" />
            <LoaderCircle v-else class="spin" :size="19" />
          </button>
        </form>
      </section>

      <aside class="workbench-side">
        <section class="side-panel">
          <header>
            <div>
              <p class="eyebrow">Device Bridge</p>
              <h3>设备绑定</h3>
            </div>
            <KeyRound :size="19" />
          </header>

          <div v-if="bindingState === 'unbound'" class="binding-empty">
            <MonitorSmartphone :size="25" />
            <p>生成绑定码后，在本地终端执行连接命令。</p>
            <button type="button" @click="generateDeviceCode">
              <KeyRound :size="17" />
              生成绑定码
            </button>
          </div>

          <template v-else>
            <div class="binding-code">
              <span>{{ bindingState === "pending" ? deviceCode : "LIN-DESKTOP" }}</span>
              <small>{{ bindingState === "pending" ? "10 分钟内有效" : "最近活跃：刚刚" }}</small>
            </div>
            <code v-if="bindingState === 'pending'">{{ connectCommand }}</code>
            <div class="binding-actions">
              <button
                v-if="bindingState === 'pending'"
                class="primary-button"
                type="button"
                @click="confirmBinding"
              >
                <Check :size="17" />
                模拟本地确认
              </button>
              <button
                v-if="bindingState === 'pending'"
                class="ghost-button"
                type="button"
                :disabled="!connectCommand"
                @click="copyConnectCommand"
              >
                <Check v-if="copied" :size="17" />
                <Copy v-else :size="17" />
                {{ copied ? "已复制" : "复制命令" }}
              </button>
              <button
                v-if="bindingState === 'bound'"
                class="danger-button"
                type="button"
                @click="askUnbind"
              >
                <Trash2 :size="17" />
                解绑设备
              </button>
              <button
                v-if="bindingState === 'bound'"
                class="ghost-button"
                type="button"
                @click="generateDeviceCode"
              >
                <RefreshCw :size="17" />
                重发绑定码
              </button>
            </div>
          </template>

          <footer class="privacy-line">
            <FolderLock :size="16" />
            <span>下发证据摘要；简历全文、证书扫描件和面试逐字稿留在本机。</span>
          </footer>
        </section>

        <section class="side-panel">
          <header>
            <div>
              <p class="eyebrow">Evidence Package</p>
              <h3>能力证据包</h3>
            </div>
            <ShieldCheck :size="19" />
          </header>
          <div v-if="!evidenceAbilities.length" class="evidence-empty">
            <FileText :size="24" />
            <p>绑定后导入第一版只读能力摘要。</p>
          </div>
          <div v-else class="evidence-list">
            <article v-for="ability in evidenceAbilities" :key="ability.name">
              <div>
                <strong>{{ ability.name }}</strong>
                <small>{{ ability.evidence }}</small>
              </div>
              <span>{{ ability.score }}</span>
            </article>
          </div>
        </section>

        <section class="side-panel">
          <header>
            <div>
              <p class="eyebrow">Applications</p>
              <h3>投递进度摘要</h3>
            </div>
            <ListChecks :size="19" />
          </header>
          <div class="application-list">
            <article v-for="item in applications" :key="item.id">
              <div class="application-info">
                <strong>{{ item.company }}</strong>
                <small>{{ item.role }}</small>
                <span>{{ item.nextAction }}</span>
              </div>
              <div class="application-state">
                <em>{{ item.stage }}</em>
                <CircleCheck v-if="item.synced" :size="17" />
                <button
                  v-else
                  type="button"
                  :disabled="bindingState !== 'bound'"
                  title="确认同步摘要"
                  @click="openSync(item)"
                >
                  同步
                </button>
              </div>
            </article>
          </div>
          <p class="sync-note">最近同步：{{ lastSyncTime || "尚未同步" }}</p>
        </section>

        <section class="side-panel">
          <header>
            <div>
              <p class="eyebrow">Agent Trace</p>
              <h3>决策链摘要</h3>
            </div>
            <Sparkles :size="19" />
          </header>
          <div class="trace-list">
            <article v-for="event in traceEvents.slice(0, 5)" :key="event.id">
              <strong>{{ event.title }}</strong>
              <p>{{ event.source }}</p>
              <small>{{ event.result }}</small>
            </article>
          </div>
        </section>
      </aside>
    </section>

    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="syncCandidate" class="confirm-layer" @click.self="syncCandidate = null">
          <section class="confirm-dialog" role="dialog" aria-modal="true" aria-label="确认同步摘要">
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
              <button class="danger-button" type="button" @click="confirmUnbind">
                确认解绑
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.local-workbench-demo {
  width: min(1320px, 100%);
  display: grid;
  gap: 16px;
  margin: 0 auto;
}

.workbench-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.workbench-header h2,
.side-panel h3,
.confirm-dialog h3 {
  margin: 3px 0 0;
  color: var(--ink);
}

.workbench-header h2 {
  font-size: clamp(25px, 3vw, 35px);
}

.workbench-header > div:first-child > p:last-child {
  margin: 7px 0 0;
  color: var(--muted);
  line-height: 1.6;
}

.header-state {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.header-state.is-bound {
  border-color: rgba(20, 123, 115, 0.28);
  background: #e8f6f1;
  color: var(--teal-dark);
}

.header-state.is-pending {
  border-color: rgba(199, 144, 37, 0.32);
  background: #fff5df;
  color: #876015;
}

.workbench-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.workbench-metrics article {
  min-width: 0;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.workbench-metrics svg {
  color: var(--teal);
}

.workbench-metrics div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.workbench-metrics strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-metrics small {
  color: var(--muted);
  font-size: 11px;
}

.workbench-layout {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.28fr) minmax(330px, 0.72fr);
  gap: 16px;
  align-items: start;
}

.terminal-panel {
  min-width: 0;
  display: grid;
  gap: 0;
  border: 1px solid #263a3d;
  border-radius: 8px;
  background: #172124;
  box-shadow: 0 20px 54px rgba(23, 33, 36, 0.16);
  overflow: hidden;
}

.terminal-titlebar {
  min-height: 56px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 24px;
  align-items: center;
  gap: 12px;
  padding: 0 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #223336;
  color: #dcebe8;
}

.terminal-dots {
  display: flex;
  gap: 6px;
}

.terminal-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #587071;
}

.terminal-dots span:first-child {
  background: #df654f;
}

.terminal-dots span:nth-child(2) {
  background: #d39a27;
}

.terminal-dots span:last-child {
  background: #3d8b77;
}

.terminal-titlebar > div {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.terminal-titlebar strong {
  font-family: Consolas, "Courier New", monospace;
  font-size: 13px;
}

.terminal-titlebar small {
  overflow: hidden;
  color: #9fb5b2;
  font-family: Consolas, "Courier New", monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-stream {
  min-height: 430px;
  max-height: min(590px, 58vh);
  display: grid;
  align-content: start;
  gap: 11px;
  padding: 17px;
  overflow: auto;
}

.message-stream article {
  max-width: min(720px, 92%);
  display: grid;
  gap: 8px;
  padding: 13px;
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
  justify-self: start;
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
  gap: 8px;
  padding: 0 15px 12px;
}

.quick-prompts button {
  min-height: 38px;
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
  grid-template-columns: minmax(0, 1fr) 50px;
  gap: 9px;
  padding: 12px 15px 15px;
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
  width: 50px;
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

.workbench-side {
  min-width: 0;
  display: grid;
  gap: 14px;
}

.side-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.side-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.side-panel > header > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.side-panel > header > svg {
  color: var(--teal);
}

.side-panel h3 {
  font-size: 18px;
}

.binding-empty,
.evidence-empty {
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

.binding-empty p,
.evidence-empty p {
  max-width: 260px;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.binding-empty svg,
.evidence-empty svg {
  color: var(--teal);
}

.binding-code {
  display: grid;
  gap: 3px;
  padding: 12px;
  border: 1px solid rgba(20, 123, 115, 0.2);
  border-radius: 8px;
  background: #eef8f5;
}

.binding-code span {
  color: var(--teal-dark);
  font-family: Consolas, "Courier New", monospace;
  font-size: 22px;
  font-weight: 900;
}

.binding-code small {
  color: var(--muted);
  font-size: 11px;
}

.side-panel > code {
  min-width: 0;
  overflow-wrap: anywhere;
  border-left: 3px solid var(--teal);
  background: var(--surface-soft);
  color: var(--ink);
  font-size: 12px;
  line-height: 1.7;
}

.binding-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.binding-actions button,
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

.privacy-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.privacy-line svg {
  flex: 0 0 auto;
  color: var(--gold);
}

.evidence-list,
.application-list,
.trace-list {
  display: grid;
  gap: 9px;
}

.evidence-list article,
.application-list article,
.trace-list article {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
}

.evidence-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
}

.evidence-list div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.evidence-list strong {
  color: var(--ink);
  font-size: 13px;
}

.evidence-list small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.evidence-list > article > span {
  color: var(--teal-dark);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.application-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.application-info {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.application-info strong {
  color: var(--ink);
  font-size: 13px;
}

.application-info small {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.application-info span {
  color: #4d5a5e;
  font-size: 11px;
  line-height: 1.5;
}

.application-state {
  display: grid;
  justify-items: center;
  gap: 6px;
}

.application-state em {
  padding: 3px 6px;
  border-radius: 5px;
  background: #e8f6f1;
  color: var(--teal-dark);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  white-space: nowrap;
}

.application-state svg {
  color: var(--teal);
}

.application-state button {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(20, 123, 115, 0.28);
  border-radius: 7px;
  background: #fff;
  color: var(--teal-dark);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.application-state button:disabled {
  border-color: var(--line);
  color: #a5adaf;
  cursor: not-allowed;
}

.sync-note {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
}

.trace-list article {
  display: grid;
  gap: 5px;
  padding: 12px;
  border-left: 3px solid var(--blue);
}

.trace-list strong {
  color: var(--ink);
  font-size: 12px;
}

.trace-list p,
.trace-list small {
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

.spin {
  animation: workbenchSpin 1s linear infinite;
}

@keyframes workbenchSpin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .workbench-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .workbench-header,
  .workbench-metrics {
    grid-template-columns: 1fr;
  }

  .workbench-header {
    display: grid;
    align-items: start;
    padding: 18px 15px;
  }

  .header-state {
    justify-self: start;
  }

  .workbench-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quick-prompts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .message-composer {
    grid-template-columns: minmax(0, 1fr) 46px;
  }
}

@media (max-width: 560px) {
  .workbench-metrics,
  .quick-prompts {
    grid-template-columns: 1fr;
  }

  .message-stream {
    min-height: 380px;
    padding: 12px;
  }

  .message-stream article {
    max-width: 100%;
  }

  .side-panel,
  .confirm-dialog {
    padding: 16px 14px;
  }

  .evidence-list article,
  .application-list article {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .evidence-list > article > span,
  .application-state {
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
