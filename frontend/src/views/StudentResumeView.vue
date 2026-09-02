<script setup lang="ts">
import { Check, CircleCheck, FileText, LayoutTemplate, Lock } from "@lucide/vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const {
  activeResumeTemplate,
  activeResumeTemplateId,
  confirmedFactCount,
  resumeAssets,
  resumeDraft,
  resumeTemplates
} = storeToRefs(store);

const atsLabel = {
  friendly: "ATS 友好",
  acceptable: "ATS 可解析",
  limited: "ATS 受限"
} as const;
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

      <WorkbenchPanel
        class="resume-template-panel"
        eyebrow="Templates"
        title="中文模板库"
        description="面向中国校招场景的 A4 版式，按投递对象选择；事实仍来自本地渲染包。"
        :icon="LayoutTemplate"
      >
        <template #actions>
          <WorkbenchStatus tone="accent">{{ activeResumeTemplate.nameZh }}</WorkbenchStatus>
        </template>

        <ul class="template-grid" aria-label="简历模板">
          <li v-for="template in resumeTemplates" :key="template.id">
            <button
              class="template-card"
              :class="{ 'is-active': template.id === activeResumeTemplateId }"
              :aria-pressed="template.id === activeResumeTemplateId"
              type="button"
              @click="store.selectResumeTemplate(template.id)"
            >
              <span class="template-preview" :data-template="template.id" aria-hidden="true">
                <span class="preview-head"></span>
                <span class="preview-line is-wide"></span>
                <span class="preview-line"></span>
                <span class="preview-line is-short"></span>
              </span>
              <span class="template-copy">
                <strong>{{ template.nameZh }}</strong>
                <small>{{ template.useCases.join(" · ") }}</small>
              </span>
              <WorkbenchStatus :tone="template.atsPosture === 'friendly' ? 'success' : template.atsPosture === 'acceptable' ? 'accent' : 'neutral'">
                {{ atsLabel[template.atsPosture] }}
              </WorkbenchStatus>
              <Check v-if="template.id === activeResumeTemplateId" class="template-selected" :size="16" />
            </button>
          </li>
        </ul>
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

.resume-template-panel {
  grid-column: 1 / -1;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.template-grid > li {
  min-width: 0;
}

.template-card {
  min-height: 104px;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 130ms ease,
    background 130ms ease,
    box-shadow 130ms ease;
}

.template-card:hover {
  border-color: rgba(20, 123, 115, 0.36);
  background: #fbfdfd;
}

.template-card.is-active {
  border-color: rgba(20, 123, 115, 0.58);
  box-shadow: 0 0 0 2px rgba(20, 123, 115, 0.1);
}

.template-preview {
  width: 46px;
  aspect-ratio: 1 / 1.32;
  display: grid;
  align-content: start;
  gap: 3px;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface-soft);
}

.template-preview[data-template="classic-ats"],
.template-preview[data-template="elegant-serif"],
.template-preview[data-template="executive"] {
  background: #fff;
}

.template-preview[data-template="classic-ats"] .preview-head,
.template-preview[data-template="elegant-serif"] .preview-head,
.template-preview[data-template="executive"] .preview-head {
  width: 72%;
  justify-self: center;
}

.template-preview[data-template="ledger"],
.template-preview[data-template="swiss"] {
  background: #fff;
}

.template-preview[data-template="ledger"] .preview-head,
.template-preview[data-template="swiss"] .preview-head {
  width: 100%;
  background: #52616d;
}

.template-preview[data-template="tech-compact"],
.template-preview[data-template="timeline"] {
  background: #fff;
}

.template-preview[data-template="tech-compact"] .preview-head,
.template-preview[data-template="timeline"] .preview-head {
  background: var(--teal);
}

.template-preview[data-template="modern-sidebar"],
.template-preview[data-template="pillar"],
.template-preview[data-template="colorblock"] {
  padding-left: 12px;
  border-left: 12px solid #29404f;
  background: #edf2f4;
}

.template-preview[data-template="modern-sidebar"] .preview-head,
.template-preview[data-template="pillar"] .preview-head,
.template-preview[data-template="colorblock"] .preview-head {
  background: #29404f;
}

.template-preview[data-template="atelier"] {
  border-color: rgba(20, 123, 115, 0.34);
}

.preview-head {
  height: 5px;
  border-radius: 1px;
  background: var(--ink);
}

.preview-line {
  height: 2px;
  border-radius: 1px;
  background: #9dabae;
}

.preview-line.is-wide {
  width: 92%;
  background: var(--teal);
}

.preview-line.is-short {
  width: 64%;
}

.template-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding-right: 4px;
}

.template-copy strong {
  color: var(--ink);
  font-size: 13px;
  line-height: 1.3;
}

.template-copy small {
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.45;
}

.template-selected {
  align-self: start;
  color: var(--teal);
}

.template-card :deep(.workbench-status) {
  max-width: 86px;
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

  .template-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .template-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .template-card {
    min-height: 96px;
  }

  .template-card :deep(.workbench-status) {
    max-width: 78px;
  }
}
</style>
