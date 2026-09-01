<script setup lang="ts">
import { ArrowRight, CircleCheck, ListChecks, ShieldCheck } from "@lucide/vue";
import { ref } from "vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import type { ApplicationItem } from "@/stores/studentWorkbench";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const { applications, bindingLabel, bindingState, interviewStages, lastSyncTime } = storeToRefs(store);
const syncCandidate = ref<ApplicationItem | null>(null);
</script>

<template>
  <StudentWorkbenchModule
    eyebrow="Interview Pipeline"
    title="面试管理"
    description="覆盖 JD 解析、投递、笔试、面试、复盘与反哺。"
    agent-action="回 Agent 准备"
    :status="bindingState === 'bound' ? `已绑定 · ${lastSyncTime || '未同步'}` : bindingLabel"
  >
    <div class="interview-layout">
      <section class="pipeline-panel" aria-label="面试流程">
        <header>
          <div>
            <p>Pipeline</p>
            <h3>完整面试流程</h3>
          </div>
          <ListChecks :size="19" />
        </header>
        <ol class="interview-pipeline">
          <li v-for="stage in interviewStages" :key="stage.id" :class="`is-${stage.state}`">
            <span></span>
            <div>
              <strong>{{ stage.name }}</strong>
              <small>{{ stage.note }}</small>
            </div>
          </li>
        </ol>
      </section>

      <section class="application-panel" aria-label="投递清单">
        <header>
          <div>
            <p>Applications</p>
            <h3>投递与下一步</h3>
          </div>
          <ShieldCheck :size="19" />
        </header>
        <div class="application-list">
          <article v-for="item in applications" :key="item.id">
            <div>
              <strong>{{ item.company }}</strong>
              <small>{{ item.role }}</small>
              <span>{{ item.nextAction }}</span>
            </div>
            <div>
              <em>{{ item.stage }}</em>
              <CircleCheck v-if="item.synced" :size="17" />
              <button
                v-else
                type="button"
                :disabled="bindingState !== 'bound'"
                @click="syncCandidate = item"
              >
                同步摘要
              </button>
            </div>
          </article>
        </div>
        <p class="sync-note">
          只同步公司、岗位、阶段和下一步；岗位评估报告、简历全文和本地备注不会上传。
        </p>
      </section>
    </div>

    <Transition name="overlay">
      <div v-if="syncCandidate" class="confirm-layer" @click.self="syncCandidate = null">
        <section class="confirm-dialog" role="dialog" aria-modal="true" aria-label="确认同步求职摘要">
          <header>
            <div>
              <p>Outbound Sync</p>
              <h3>同步求职摘要</h3>
            </div>
            <ShieldCheck :size="21" />
          </header>
          <p>
            将同步 {{ syncCandidate.company }} · {{ syncCandidate.role }} 的公司、岗位、阶段和下一步。
            岗位评估报告全文、简历全文和本地备注不会上传。
          </p>
          <footer>
            <button type="button" @click="syncCandidate = null">取消</button>
            <button
              type="button"
              @click="
                store.confirmSync(syncCandidate);
                syncCandidate = null
              "
            >
              <ArrowRight :size="16" />
              确认同步
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </StudentWorkbenchModule>
</template>

<style scoped>
.interview-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 14px;
  align-items: start;
}

.pipeline-panel,
.application-panel,
.application-list article,
.confirm-dialog {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.pipeline-panel,
.application-panel {
  display: grid;
  gap: 14px;
  padding: 17px;
}

.pipeline-panel > header,
.application-panel > header,
.confirm-dialog header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pipeline-panel > header > div,
.application-panel > header > div,
.confirm-dialog header div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.pipeline-panel > header svg,
.application-panel > header svg,
.confirm-dialog header svg {
  color: var(--teal);
}

.pipeline-panel p:first-child,
.application-panel p:first-child,
.confirm-dialog p:first-child {
  margin: 0;
  color: var(--teal);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.pipeline-panel h3,
.application-panel h3,
.confirm-dialog h3 {
  margin: 0;
  color: var(--ink);
  font-size: 18px;
}

.interview-pipeline {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.interview-pipeline li {
  position: relative;
  min-height: 54px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
}

.interview-pipeline li::after {
  position: absolute;
  top: 34px;
  bottom: -8px;
  left: 22px;
  width: 2px;
  background: var(--line);
  content: "";
}

.interview-pipeline li:last-child::after {
  display: none;
}

.interview-pipeline span {
  width: 12px;
  height: 12px;
  justify-self: center;
  border: 3px solid #9fb5b2;
  border-radius: 50%;
  background: #fff;
}

.interview-pipeline li.is-done span {
  border-color: var(--teal);
  background: var(--teal);
}

.interview-pipeline li.is-current span {
  border-color: #c79025;
  box-shadow: 0 0 0 4px rgba(199, 144, 37, 0.14);
}

.interview-pipeline div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.interview-pipeline strong {
  color: var(--ink);
  font-size: 13px;
}

.interview-pipeline small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.application-list {
  display: grid;
  gap: 9px;
}

.application-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 13px;
}

.application-list article > div:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.application-list strong {
  color: var(--ink);
  font-size: 14px;
}

.application-list small {
  color: var(--muted);
  font-size: 11px;
}

.application-list article > div:first-child > span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.application-list article > div:last-child {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}

.application-list em {
  padding: 6px 8px;
  border-radius: 6px;
  background: #e8f6f1;
  color: var(--teal-dark);
  font-size: 10px;
  font-style: normal;
  font-weight: 850;
}

.application-list svg {
  color: var(--teal);
}

.application-list button {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--ink);
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.application-list button:disabled {
  color: var(--muted);
  cursor: not-allowed;
  opacity: 0.55;
}

.sync-note {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.confirm-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(23, 33, 36, 0.48);
}

.confirm-dialog {
  width: min(430px, 100%);
  display: grid;
  gap: 14px;
  padding: 20px;
}

.confirm-dialog > p {
  margin: 0;
  color: var(--muted);
  line-height: 1.65;
}

.confirm-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-dialog footer button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}

.confirm-dialog footer button:last-child {
  border-color: var(--teal);
  background: var(--teal);
  color: #fff;
}

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.16s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

@media (max-width: 960px) {
  .interview-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .application-list article {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .application-list article > div:last-child {
    justify-content: flex-start;
  }
}
</style>
