<script setup lang="ts">
import { CircleCheck, FileText, Lock } from "@lucide/vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const { confirmedFactCount, resumeAssets, resumeDraft } = storeToRefs(store);
</script>

<template>
  <StudentWorkbenchModule
    eyebrow="Resume Delivery"
    title="简历管理"
    description="管理版本、候选条目与事实确认，交付文件保留在本机。"
    agent-action="回 Agent 生成"
    status="本地文件优先"
  >
    <div class="resume-layout">
      <WorkbenchPanel
        eyebrow="Versions"
        title="简历版本"
        :icon="FileText"
        description="同一份能力资产面向不同岗位生成版本。"
      >
        <article v-for="asset in resumeAssets" :key="asset.id" class="resume-version">
          <div>
            <strong>{{ asset.name }} {{ asset.version }}</strong>
            <small>{{ asset.coverage }}</small>
          </div>
          <WorkbenchStatus :tone="asset.status === '已锁定' ? 'success' : 'warning'">
            <Lock v-if="asset.status === '已锁定'" :size="13" />
            {{ asset.status }}
          </WorkbenchStatus>
        </article>
      </WorkbenchPanel>

      <WorkbenchPanel
        eyebrow="Candidate Bullet"
        title="候选简历条目"
        description="候选 bullet 中的事实逐条确认，未确认内容不会进入锁定版本。"
      >
        <template #actions>
          <WorkbenchStatus tone="accent">
            {{ confirmedFactCount }} / {{ resumeDraft.facts.length }} 事实已确认
          </WorkbenchStatus>
        </template>

        <p class="draft-bullet">{{ resumeDraft.bullet }}</p>
        <ul class="fact-list">
          <li v-for="fact in resumeDraft.facts" :key="fact.id">
            <span>{{ fact.label }} · {{ fact.source }}</span>
            <CircleCheck v-if="fact.confirmed" class="fact-done" :size="17" />
            <WorkbenchButton v-else size="sm" variant="dark" @click="store.confirmResumeFact(fact.id)">
              确认事实
            </WorkbenchButton>
          </li>
        </ul>
        <p class="local-note">简历全文和事实确认记录保留在本机；未确认事实不会进入锁定版本。</p>
      </WorkbenchPanel>
    </div>
  </StudentWorkbenchModule>
</template>

<style scoped>
.resume-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
  gap: 14px;
  align-items: start;
}

.resume-version {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.resume-version div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.resume-version strong {
  color: var(--ink);
  font-size: 14px;
}

.resume-version small {
  color: var(--muted);
  font-size: 11px;
}

.draft-bullet {
  margin: 0;
  padding: 13px;
  border-left: 3px solid var(--teal);
  border-radius: 7px;
  background: #fbfdfd;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.7;
}

.fact-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.fact-list li {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
}

.fact-list li > span {
  min-width: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.fact-done {
  flex: 0 0 auto;
  color: var(--teal);
}

.local-note {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .resume-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .resume-version {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .fact-list li {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
