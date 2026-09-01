<script setup lang="ts">
import { CircleCheck, FileText, Lock } from "@lucide/vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
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
      <section class="resume-versions" aria-label="简历版本">
        <header>
          <div>
            <p>Versions</p>
            <h3>简历版本</h3>
          </div>
          <FileText :size="19" />
        </header>
        <article v-for="asset in resumeAssets" :key="asset.id" class="resume-version">
          <div>
            <strong>{{ asset.name }} {{ asset.version }}</strong>
            <small>{{ asset.coverage }}</small>
          </div>
          <span :class="{ 'is-locked': asset.status === '已锁定' }">
            <Lock v-if="asset.status === '已锁定'" :size="13" />
            {{ asset.status }}
          </span>
        </article>
      </section>

      <section class="resume-draft" aria-label="候选简历条目">
        <header>
          <div>
            <p>Candidate Bullet</p>
            <h3>候选简历条目</h3>
          </div>
          <span>{{ confirmedFactCount }} / {{ resumeDraft.facts.length }} 事实已确认</span>
        </header>
        <p class="draft-bullet">{{ resumeDraft.bullet }}</p>
        <ul>
          <li v-for="fact in resumeDraft.facts" :key="fact.id">
            <span>{{ fact.label }} · {{ fact.source }}</span>
            <button v-if="!fact.confirmed" type="button" @click="store.confirmResumeFact(fact.id)">
              确认事实
            </button>
            <CircleCheck v-else :size="17" />
          </li>
        </ul>
        <p class="local-note">简历全文和事实确认记录保留在本机；未确认事实不会进入锁定版本。</p>
      </section>
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

.resume-versions,
.resume-draft,
.resume-version {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.resume-versions,
.resume-draft {
  display: grid;
  gap: 12px;
  padding: 17px;
}

.resume-versions > header,
.resume-draft > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.resume-versions > header > div,
.resume-draft > header > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.resume-versions > header svg {
  color: var(--teal);
}

.resume-versions p:first-child,
.resume-draft p:first-child {
  margin: 0;
  color: var(--teal);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.resume-versions h3,
.resume-draft h3 {
  margin: 0;
  color: var(--ink);
  font-size: 18px;
}

.resume-draft > header > span {
  flex: 0 0 auto;
  padding: 6px 8px;
  border-radius: 6px;
  background: #e8f6f1;
  color: var(--teal-dark);
  font-size: 11px;
  font-weight: 850;
}

.resume-version {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 13px;
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

.resume-version span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f4f7f7;
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
  white-space: nowrap;
}

.resume-version span.is-locked {
  background: #e8f6f1;
  color: var(--teal-dark);
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

.resume-draft ul {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.resume-draft li {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
}

.resume-draft li > span {
  min-width: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.resume-draft li > svg {
  flex: 0 0 auto;
  color: var(--teal);
}

.resume-draft li button {
  flex: 0 0 auto;
  min-height: 31px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: var(--ink);
  color: #fff;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
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

  .resume-version span {
    justify-self: start;
  }

  .resume-draft li {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
