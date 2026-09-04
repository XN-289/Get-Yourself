<script setup lang="ts">
import { ArrowUpRight, Download, FolderTree, Repeat, ShieldCheck } from "@lucide/vue";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { useMutation } from "@tanstack/vue-query";

import { achievementsApi } from "@/api/achievements";
import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import { modulePath, useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const { careerStages, evidenceAbilities, evidenceVersion } = storeToRefs(store);
const selectedStageId = ref("asset");
const graduationYear = ref("");
const targetRoleText = ref("");
const validationError = ref("");
const exportedAt = ref("");

const selectedStage = computed(
  () => careerStages.value.find((stage) => stage.id === selectedStageId.value) ?? careerStages.value[1]
);

const exportEvidencePackage = useMutation({
  mutationFn: (input: { graduationYear: number; targetRoles: string[] }) =>
    achievementsApi.exportEvidencePackage(input.graduationYear, input.targetRoles),
  onSuccess: (evidencePackage) => {
    const blob = new Blob([JSON.stringify(evidencePackage, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `get-yourself-evidence-package-${evidencePackage.packageId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    exportedAt.value = new Date().toLocaleTimeString();
  }
});

const exporting = computed(() => exportEvidencePackage.isPending.value);
const exportError = computed(() => {
  if (validationError.value) return validationError.value;
  if (!exportEvidencePackage.isError.value) return "";
  return exportEvidencePackage.error.value instanceof Error
    ? exportEvidencePackage.error.value.message
    : "能力证据包导出失败";
});

const canExport = computed(() =>
  /^\d{4}$/.test(graduationYear.value)
  && Number(graduationYear.value) >= 2000
  && Number(graduationYear.value) <= 2100
  && targetRoleText.value.trim().length > 0
  && !exporting.value
);

function submitEvidenceExport() {
  if (!canExport.value) return;

  const targetRoles = targetRoleText.value
    .split(/[,，、]/)
    .map(role => role.trim())
    .filter(Boolean);
  if (targetRoles.length > 10) {
    validationError.value = "目标方向最多 10 个";
    return;
  }
  if (targetRoles.some(role => role.length > 40)) {
    validationError.value = "单个目标方向不能超过 40 字";
    return;
  }
  if (!targetRoles.length) {
    validationError.value = "请填写目标方向";
    return;
  }

  validationError.value = "";
  exportEvidencePackage.mutate({
    graduationYear: Number(graduationYear.value),
    targetRoles
  });
}
</script>

<template>
  <StudentWorkbenchModule
    eyebrow="Structured Assets"
    title="能力资产"
    description="成长经历、面试复盘与 JD 差距沉淀为可追溯证据。"
    agent-action="回 Agent 整理"
    :status="evidenceVersion"
  >
    <div class="assets-layout">
      <WorkbenchPanel
        eyebrow="Career Tree"
        title="职业成长树"
        :icon="FolderTree"
        description="成长经历可以非线性；求职主线按资产、交付、实践、反哺推进。"
      >
        <div class="growth-tree">
          <button
            v-for="stage in careerStages"
            :key="stage.id"
            type="button"
            :class="{ 'is-selected': selectedStageId === stage.id }"
            @click="selectedStageId = stage.id"
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
            <RouterLink
              v-for="artifact in selectedStage.artifacts"
              :key="artifact"
              :to="modulePath(selectedStage.module)"
            >
              {{ artifact }}
              <ArrowUpRight :size="14" />
            </RouterLink>
          </div>
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        eyebrow="Evidence"
        title="能力证据"
        :icon="ShieldCheck"
        description="证据来自成长记录、面试复盘和 JD 差距，先确认再参与评分。"
      >
        <form class="export-panel" @submit.prevent="submitEvidenceExport">
          <label>
            毕业年份
            <input
              v-model="graduationYear"
              inputmode="numeric"
              maxlength="4"
              placeholder="2027"
              type="text"
            >
          </label>
          <label>
            目标方向
            <input
              v-model="targetRoleText"
              maxlength="400"
              placeholder="Java 后端开发"
              type="text"
            >
          </label>
          <WorkbenchButton type="submit" variant="primary" :disabled="!canExport">
            <Download :size="15" />
            {{ exporting ? "导出中" : "导出证据包" }}
          </WorkbenchButton>
          <small v-if="exportError" class="export-message is-error">{{ exportError }}</small>
          <small v-else-if="exportedAt" class="export-message">已导出 {{ exportedAt }}</small>
        </form>

        <div v-if="!evidenceAbilities.length" class="empty-state">
          <ShieldCheck :size="25" />
          <p>还没有导入能力证据。先在 Agent 工作台连接本地工位，或直接口述一段经历。</p>
        </div>

        <template v-if="evidenceAbilities.length">
          <article v-for="ability in evidenceAbilities" :key="ability.id" class="asset-card">
            <div>
              <strong>{{ ability.name }}</strong>
              <small>{{ ability.evidence }}</small>
            </div>
            <span>{{ ability.score }}</span>
            <WorkbenchStatus
              :tone="ability.source === 'growth' ? 'accent' : ability.source === 'interview' ? 'warning' : 'neutral'"
            >
              {{
                ability.source === "interview"
                  ? "面试反哺"
                  : ability.source === "jd"
                    ? "JD 差距"
                    : "成长记录"
              }}
            </WorkbenchStatus>
          </article>
        </template>

        <article class="feedback-source">
          <Repeat :size="17" />
          <span>面试复盘与 JD 差距会作为候选证据进入这里，用户确认后参与评分。</span>
        </article>
      </WorkbenchPanel>
    </div>
  </StudentWorkbenchModule>
</template>

<style scoped>
.assets-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 14px;
  align-items: start;
}

.growth-tree {
  display: grid;
  gap: 6px;
}

.growth-tree button {
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.growth-tree button::after {
  position: absolute;
  top: 30px;
  bottom: -7px;
  left: 21px;
  width: 2px;
  background: var(--line);
  content: "";
}

.growth-tree button:last-child::after {
  display: none;
}

.growth-tree button:hover,
.growth-tree button.is-selected {
  border-color: rgba(39, 155, 137, 0.44);
  background: #edf7f4;
}

.stage-marker {
  width: 11px;
  height: 11px;
  justify-self: center;
  border: 3px solid #9fb5b2;
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
  border-color: var(--gold);
}

.stage-marker.is-feeding-back {
  border-color: #8750a1;
}

.growth-tree span:not(.stage-marker) {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.growth-tree strong {
  color: var(--ink);
  font-size: 13px;
}

.growth-tree small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.stage-detail {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px dashed var(--line);
  border-radius: 7px;
  background: #fbfdfd;
}

.stage-detail strong {
  color: var(--ink);
  font-size: 13px;
}

.stage-detail div {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.stage-detail a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--teal-dark);
  font-size: 11px;
  font-weight: 800;
}

.export-panel {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
}

.export-panel label {
  min-width: 0;
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
}

.export-panel input {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
}

.export-message {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

.export-message.is-error {
  color: #b23b32;
}

.asset-card,
.feedback-source,
.empty-state {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.asset-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
}

.asset-card div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.asset-card strong {
  color: var(--ink);
  font-size: 14px;
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

.feedback-source {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.feedback-source svg {
  flex: 0 0 auto;
  color: var(--teal);
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 9px;
  padding: 34px 18px;
  color: var(--muted);
  text-align: center;
}

.empty-state p {
  margin: 0;
  max-width: 380px;
  line-height: 1.6;
}

.empty-state svg {
  color: var(--teal);
}

@media (max-width: 960px) {
  .assets-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .export-panel {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .asset-card {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .asset-card > span,
  .asset-card > :last-child {
    justify-self: start;
  }
}
</style>
