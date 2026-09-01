<script setup lang="ts">
import { ArrowRight, CircleCheck, ListChecks, ShieldCheck } from "@lucide/vue";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDialog from "@/components/ui/WorkbenchDialog.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import type { ApplicationItem } from "@/stores/studentWorkbench";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const { applications, bindingLabel, bindingState, interviewStages, lastSyncTime } = storeToRefs(store);
const syncCandidate = ref<ApplicationItem | null>(null);
const syncDialogOpen = computed({
  get: () => syncCandidate.value !== null,
  set: (open: boolean) => {
    if (!open) syncCandidate.value = null;
  }
});
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
      <WorkbenchPanel
        eyebrow="Pipeline"
        title="完整面试流程"
        :icon="ListChecks"
        description="流程不是装饰，每一步都对应一个可执行的下一步。"
      >
        <ol class="interview-pipeline">
          <li v-for="stage in interviewStages" :key="stage.id" :class="`is-${stage.state}`">
            <span></span>
            <div>
              <strong>{{ stage.name }}</strong>
              <small>{{ stage.note }}</small>
            </div>
          </li>
        </ol>
      </WorkbenchPanel>

      <WorkbenchPanel
        eyebrow="Applications"
        title="投递与下一步"
        :icon="ShieldCheck"
        description="按下一动作排序，摘要同步前始终需要用户确认。"
      >
        <div class="application-list">
          <article v-for="item in applications" :key="item.id">
            <div>
              <strong>{{ item.company }}</strong>
              <small>{{ item.role }}</small>
              <span>{{ item.nextAction }}</span>
            </div>
            <div>
              <WorkbenchStatus :tone="item.stage === '待评估' ? 'warning' : 'accent'">
                {{ item.stage }}
              </WorkbenchStatus>
              <CircleCheck v-if="item.synced" class="sync-done" :size="17" />
              <WorkbenchButton
                v-else
                size="sm"
                :disabled="bindingState !== 'bound'"
                @click="syncCandidate = item"
              >
                同步摘要
              </WorkbenchButton>
            </div>
          </article>
        </div>
        <p class="sync-note">
          只同步公司、岗位、阶段和下一步；岗位评估报告、简历全文和本地备注不会上传。
        </p>
      </WorkbenchPanel>
    </div>

    <WorkbenchDialog
      v-model:open="syncDialogOpen"
      title="同步求职摘要"
      :description="syncCandidate ? `${syncCandidate.company} · ${syncCandidate.role}` : ''"
    >
      <p>
        将同步公司、岗位、阶段和下一步。岗位评估报告全文、简历全文和本地备注不会上传。
      </p>
      <template #footer>
        <WorkbenchButton size="sm" @click="syncCandidate = null">取消</WorkbenchButton>
        <WorkbenchButton
          size="sm"
          variant="primary"
          @click="
            if (syncCandidate) {
              store.confirmSync(syncCandidate);
              syncCandidate = null;
            }
          "
        >
          <ArrowRight :size="16" />
          确认同步
        </WorkbenchButton>
      </template>
    </WorkbenchDialog>
  </StudentWorkbenchModule>
</template>

<style scoped>
.interview-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 14px;
  align-items: start;
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
  border-color: var(--gold);
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
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
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

.sync-done {
  color: var(--teal);
}

.sync-note {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.workbench-dialog-body p {
  margin: 0;
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
