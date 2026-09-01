<script setup lang="ts">
import {
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  MonitorSmartphone,
  Send,
  Terminal,
  Trash2
} from "@lucide/vue";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { useClipboard, useTimeoutFn } from "@vueuse/core";

import AgentMarkdown from "@/components/agent/AgentMarkdown.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDialog from "@/components/ui/WorkbenchDialog.vue";
import { modulePath, useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const {
  activeDevices,
  activeIntent,
  bindingLabel,
  bindingState,
  deviceBusy,
  deviceError,
  connectCommand,
  deviceCode,
  input,
  latestTrace,
  messages,
  primaryDevice,
  sending
} = storeToRefs(store);

const messageStream = ref<HTMLElement | null>(null);
const copied = ref(false);
const deviceManagerOpen = ref(false);
const { copy } = useClipboard({ source: connectCommand });
const { start: startCopyReset, stop: stopCopyReset } = useTimeoutFn(() => {
  copied.value = false;
}, 2000);

const quickPrompts = [
  { intent: "experience", label: "整理经历" },
  { intent: "resume", label: "生成简历" },
  { intent: "interview", label: "准备面试" },
  { intent: "review", label: "复盘反哺" }
] as const;

onMounted(() => {
  void store.initializeDevices();
});

onBeforeUnmount(() => {
  store.stopDevicePolling();
});

async function copyConnectCommand() {
  if (!connectCommand.value) return;
  try {
    await copy(connectCommand.value);
    copied.value = true;
    stopCopyReset();
    startCopyReset();
  } catch {
    copied.value = false;
  }
}

async function submit(submitted = input.value) {
  await store.submitMessage(submitted);
  await nextTick();
  messageStream.value?.scrollTo({
    top: messageStream.value.scrollHeight,
    behavior: "smooth"
  });
}

function submitQuickPrompt(prompt: (typeof quickPrompts)[number]) {
  const text = {
    experience: "把我大二做宿舍报修小程序的经历整理成能力资产。",
    resume: "把能力资产转成 Java 后端简历条目，并标出待确认事实。",
    interview: "明天下午远山数据一面，帮我按完整面试流程准备。",
    review: "我刚才被追问接口权限设计，帮我复盘并反哺能力资产。"
  }[prompt.intent];
  void submit(text);
}
</script>

<template>
  <section class="agent-console">
    <header class="console-header">
      <div class="console-title">
        <span><Bot :size="21" /></span>
        <div>
          <strong>GY Agent</strong>
          <small>求职任务 · 本地工位</small>
        </div>
      </div>

      <div class="console-tools">
        <span class="connection-state" :class="`is-${bindingState}`">
          <MonitorSmartphone :size="15" />
          {{ bindingLabel }}
        </span>
        <button
          v-if="bindingState === 'unbound'"
          type="button"
          :disabled="deviceBusy"
          @click="store.generateDeviceCode()"
        >
          <KeyRound :size="15" />
          连接工位
        </button>
        <button v-else-if="bindingState === 'bound'" type="button" @click="deviceManagerOpen = true">
          <Trash2 :size="15" />
          设备
        </button>
      </div>
    </header>

    <div v-if="bindingState === 'pending'" class="connect-bar">
      <Terminal :size="16" />
      <div class="connect-command">
        <code>{{ connectCommand }}</code>
        <small>绑定码 10 分钟内有效</small>
      </div>
      <button type="button" @click="copyConnectCommand">
        <Check v-if="copied" :size="15" />
        <Copy v-else :size="15" />
        {{ copied ? "已复制" : "复制" }}
      </button>
    </div>

    <div v-if="deviceError" class="device-error" role="alert">{{ deviceError }}</div>

    <div ref="messageStream" class="message-stream">
      <article v-for="message in messages" :key="message.id" :class="`is-${message.role}`">
        <header>
          <strong>{{ message.title }}</strong>
          <span v-if="message.tags.length">{{ message.tags.join(" · ") }}</span>
        </header>
        <AgentMarkdown :content="message.lines.join('\n\n')" />
        <RouterLink v-if="message.target" :to="modulePath(message.target)">
          {{ message.resultLabel ?? "打开模块" }}
          <ArrowUpRight :size="15" />
        </RouterLink>
      </article>

      <article v-if="sending" class="is-assistant is-loading">
        <header>
          <strong>GY Agent</strong>
          <span>正在处理</span>
        </header>
        <p><LoaderCircle class="spin" :size="16" /> 正在调用求职流程...</p>
      </article>
    </div>

    <div class="console-footer">
      <div class="quick-prompts" aria-label="常用求职任务">
        <button
          v-for="prompt in quickPrompts"
          :key="prompt.intent"
          type="button"
          :class="{ 'is-active': activeIntent === prompt.intent && !sending }"
          :disabled="sending"
          @click="submitQuickPrompt(prompt)"
        >
          {{ prompt.label }}
        </button>
      </div>

      <form class="composer" @submit.prevent="submit()">
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

      <footer class="trace-strip">
        <span>Agent Trace</span>
        <p v-if="latestTrace[0]">{{ latestTrace[0].title }} · {{ latestTrace[0].result }}</p>
        <p v-else>暂无执行记录</p>
        <small v-if="bindingState === 'bound'">{{ primaryDevice?.deviceName }}</small>
        <small v-else-if="deviceCode">{{ deviceCode }}</small>
      </footer>
    </div>

    <WorkbenchDialog
      v-model:open="deviceManagerOpen"
      title="已绑定设备"
      description="解绑只撤销云端授权，本地产物和已显式导入的证据文件会保留。"
    >
      <div class="device-list">
        <div v-for="device in activeDevices" :key="device.id" class="device-row">
          <div>
            <strong>{{ device.deviceName }}</strong>
            <small>最近活跃 {{ store.formatDeviceTime(device.lastActiveAt) }}</small>
          </div>
          <WorkbenchButton
            size="sm"
            variant="danger"
            :disabled="deviceBusy"
            @click="store.unbind(device.id)"
          >
            <Trash2 :size="14" />
            解绑
          </WorkbenchButton>
        </div>
      </div>
      <template #footer>
        <WorkbenchButton size="sm" @click="deviceManagerOpen = false">关闭</WorkbenchButton>
      </template>
    </WorkbenchDialog>
  </section>
</template>

<style scoped>
.agent-console {
  width: min(980px, 100%);
  min-height: calc(100vh - 188px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  margin: 0 auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  box-shadow: 0 18px 44px rgba(32, 44, 47, 0.08);
  overflow: hidden;
}

.console-header {
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  background: #fbfdfc;
}

.console-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.console-title > span {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: #e8f6f1;
  color: var(--teal-dark);
}

.console-title div {
  display: grid;
  gap: 2px;
}

.console-title strong {
  font-size: 14px;
}

.console-title small {
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.connection-state {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
}

.connection-state.is-bound {
  border-color: rgba(20, 123, 115, 0.28);
  background: #edf7f3;
  color: var(--teal-dark);
}

.connection-state.is-pending {
  border-color: rgba(199, 144, 37, 0.32);
  background: #fff8e9;
  color: #8a5f14;
}

.console-tools button,
.connect-bar button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.console-tools button:hover,
.connect-bar button:hover {
  border-color: rgba(20, 123, 115, 0.36);
  color: var(--teal-dark);
}

.connect-bar {
  min-height: 50px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--line);
  background: #f7fbf9;
  color: var(--teal-dark);
}

.connect-command {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;
}

.connect-command code {
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: 12px;
}

.connect-command small {
  color: var(--muted);
  font-size: 10px;
}

.connect-bar button:disabled,
.console-tools button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.device-error {
  padding: 7px 14px;
  border-bottom: 1px solid rgba(180, 72, 58, 0.28);
  background: #fdf3f1;
  color: #9a3c30;
  font-size: 11px;
}

.device-list {
  display: grid;
  gap: 9px;
}

.device-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #f8fafb;
}

.device-row > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.device-row strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-row small {
  color: var(--muted);
  font-size: 10px;
}

.message-stream {
  min-height: 320px;
  display: grid;
  align-content: start;
  gap: 15px;
  padding: 22px clamp(16px, 3vw, 30px);
  background: #fff;
  overflow: auto;
}

.message-stream article {
  max-width: min(760px, 100%);
  display: grid;
  gap: 7px;
  padding: 0;
  color: var(--ink);
  line-height: 1.65;
}

.message-stream article.is-user {
  justify-self: end;
  max-width: min(660px, 94%);
  padding: 11px 14px;
  border: 1px solid #cfe9e1;
  border-radius: 8px;
  background: #edf7f3;
}

.message-stream article.is-system {
  padding: 11px 14px;
  border: 1px solid rgba(199, 144, 37, 0.3);
  border-radius: 8px;
  background: #fff8e9;
}

.message-stream article.is-assistant {
  padding-left: 13px;
  border-left: 2px solid #d9e2df;
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
  color: var(--muted);
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

.message-stream a {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  border: 1px solid rgba(20, 123, 115, 0.28);
  border-radius: 7px;
  background: #fff;
  color: var(--teal-dark);
  font-size: 12px;
  font-weight: 850;
}

.message-stream .is-loading p {
  display: flex;
  align-items: center;
  gap: 7px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.console-footer {
  display: grid;
  border-top: 1px solid var(--line);
  background: #fbfdfc;
}

.quick-prompts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  padding: 12px 14px 0;
}

.quick-prompts button {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: #4f5a5e;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.quick-prompts button:hover:not(:disabled),
.quick-prompts button.is-active {
  border-color: rgba(20, 123, 115, 0.38);
  background: #edf7f3;
  color: var(--teal-dark);
}

.quick-prompts button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  gap: 8px;
  padding: 11px 14px;
}

.composer textarea {
  width: 100%;
  min-height: 58px;
  max-height: 130px;
  resize: vertical;
  border: 1px solid #d7dbd8;
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  outline: 0;
}

.composer textarea::placeholder {
  color: #8b959a;
}

.composer textarea:focus-visible {
  border-color: rgba(20, 123, 115, 0.62);
  box-shadow: 0 0 0 3px rgba(20, 123, 115, 0.12);
}

.composer > button {
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

.composer > button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.trace-strip {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 14px 10px;
  border-top: 1px solid #eef1ef;
  color: var(--muted);
  font-size: 11px;
}

.trace-strip span {
  flex: 0 0 auto;
  color: var(--teal-dark);
  font-weight: 900;
}

.trace-strip p {
  min-width: 0;
  flex: 1;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-strip small {
  flex: 0 0 auto;
  font-family: Consolas, "Courier New", monospace;
}

@media (max-width: 760px) {
  .agent-console {
    min-height: calc(100vh - 178px);
  }

  .console-header {
    align-items: stretch;
    flex-direction: column;
  }

  .console-tools {
    justify-content: space-between;
  }

  .connect-bar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .connect-bar > button {
    flex: 1 0 100%;
  }

  .quick-prompts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .trace-strip {
    align-items: flex-start;
  }

  .trace-strip p {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  .message-stream {
    min-height: 300px;
    padding: 12px;
  }
}
</style>
