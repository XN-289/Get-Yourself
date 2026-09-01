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
import { nextTick, ref } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { useClipboard, useTimeoutFn } from "@vueuse/core";

import AgentMarkdown from "@/components/agent/AgentMarkdown.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDialog from "@/components/ui/WorkbenchDialog.vue";
import { modulePath, useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const {
  activeIntent,
  bindingLabel,
  bindingState,
  connectCommand,
  deviceCode,
  evidenceVersion,
  input,
  latestTrace,
  messages,
  sending
} = storeToRefs(store);

const messageStream = ref<HTMLElement | null>(null);
const copied = ref(false);
const unbindOpen = ref(false);
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
          <small>~/get-yourself/job-search</small>
        </div>
      </div>

      <div class="console-tools">
        <span class="connection-state" :class="`is-${bindingState}`">
          <MonitorSmartphone :size="15" />
          {{ bindingLabel }}
        </span>
        <button v-if="bindingState === 'unbound'" type="button" @click="store.generateDeviceCode()">
          <KeyRound :size="15" />
          连接工位
        </button>
        <button v-else-if="bindingState === 'bound'" type="button" @click="unbindOpen = true">
          <Trash2 :size="15" />
          解绑
        </button>
      </div>
    </header>

    <div v-if="bindingState === 'pending'" class="connect-bar">
      <Terminal :size="16" />
      <code>{{ connectCommand }}</code>
      <button type="button" @click="copyConnectCommand">
        <Check v-if="copied" :size="15" />
        <Copy v-else :size="15" />
        {{ copied ? "已复制" : "复制" }}
      </button>
      <button class="confirm" type="button" @click="store.confirmBinding()">模拟本地确认</button>
    </div>

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
        <small v-if="bindingState === 'bound'">{{ evidenceVersion }}</small>
        <small v-else-if="deviceCode">{{ deviceCode }}</small>
      </footer>
    </div>

    <WorkbenchDialog
      v-model:open="unbindOpen"
      title="解绑本地设备"
      description="解绑后云端停止接收这台设备的摘要，本地简历、报告和投递明细会保留。"
    >
      <template #footer>
        <WorkbenchButton size="sm" @click="unbindOpen = false">取消</WorkbenchButton>
        <WorkbenchButton
          size="sm"
          variant="danger"
          @click="
            unbindOpen = false;
            store.unbind()
          "
        >
          确认解绑
        </WorkbenchButton>
      </template>
    </WorkbenchDialog>
  </section>
</template>

<style scoped>
.agent-console {
  width: min(960px, 100%);
  min-height: calc(100vh - 188px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  margin: 0 auto;
  border: 1px solid #263a3d;
  border-radius: 8px;
  background: #172124;
  color: #e8f0ef;
  box-shadow: 0 20px 54px rgba(23, 33, 36, 0.16);
  overflow: hidden;
}

.console-header {
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #223336;
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
  background: rgba(86, 191, 175, 0.2);
  color: #8fd6c8;
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
  color: #9fb5b2;
  font-family: Consolas, "Courier New", monospace;
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
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  color: #b9cbc8;
  font-size: 11px;
  font-weight: 850;
}

.connection-state.is-bound {
  border-color: rgba(86, 191, 175, 0.46);
  background: rgba(20, 123, 115, 0.28);
  color: #b7e5da;
}

.connection-state.is-pending {
  border-color: rgba(199, 144, 37, 0.48);
  background: rgba(199, 144, 37, 0.18);
  color: #f0d69b;
}

.console-tools button,
.connect-bar button {
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
  font-weight: 850;
  cursor: pointer;
}

.console-tools button:hover,
.connect-bar button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.connect-bar {
  min-height: 50px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  background: #1c2c2f;
  color: #8fd6c8;
}

.connect-bar code {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  color: #dcebe8;
  font-size: 12px;
}

.connect-bar .confirm {
  border-color: rgba(86, 191, 175, 0.62);
  background: rgba(20, 123, 115, 0.45);
}

.message-stream {
  min-height: 320px;
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 18px;
  overflow: auto;
}

.message-stream article {
  max-width: min(720px, 94%);
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
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

.message-stream a {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  border: 1px solid rgba(86, 191, 175, 0.48);
  border-radius: 7px;
  color: #b7e5da;
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
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: #1d2e30;
}

.quick-prompts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  padding: 12px 14px 0;
}

.quick-prompts button {
  min-height: 36px;
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
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
  color: #eef5f4;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  outline: 0;
}

.composer textarea::placeholder {
  color: #91a8a6;
}

.composer textarea:focus-visible {
  border-color: rgba(86, 191, 175, 0.75);
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
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  color: #8fa9a6;
  font-size: 11px;
}

.trace-strip span {
  flex: 0 0 auto;
  color: #b7e5da;
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
