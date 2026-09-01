<script setup lang="ts">
import { ArrowUpRight, FolderTree, Repeat, ShieldCheck } from "@lucide/vue";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import { modulePath, useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const { careerStages, evidenceAbilities, evidenceVersion } = storeToRefs(store);
const selectedStageId = ref("asset");

const selectedStage = computed(
  () => careerStages.value.find((stage) => stage.id === selectedStageId.value) ?? careerStages.value[1]
);
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
      <section class="tree-panel" aria-label="职业成长树">
        <header>
          <div>
            <p>Career Tree</p>
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
            <RouterLink v-for="artifact in selectedStage.artifacts" :key="artifact" :to="modulePath(selectedStage.module)">
              {{ artifact }}
              <ArrowUpRight :size="14" />
            </RouterLink>
          </div>
        </div>
      </section>

      <section class="ability-panel" aria-label="能力资产清单">
        <header>
          <div>
            <p>Evidence</p>
            <h3>能力证据</h3>
          </div>
          <ShieldCheck :size="19" />
        </header>

        <div v-if="!evidenceAbilities.length" class="empty-state">
          <ShieldCheck :size="25" />
          <p>还没有导入能力证据。先在 Agent 工作台连接本地工位，或直接口述一段经历。</p>
        </div>

        <template v-else>
          <article v-for="ability in evidenceAbilities" :key="ability.id" class="asset-card">
            <div>
              <strong>{{ ability.name }}</strong>
              <small>{{ ability.evidence }}</small>
            </div>
            <span>{{ ability.score }}</span>
            <em>
              {{
                ability.source === "interview"
                  ? "面试反哺"
                  : ability.source === "jd"
                    ? "JD 差距"
                    : "成长记录"
              }}
            </em>
          </article>
          <article class="feedback-source">
            <Repeat :size="17" />
            <span>面试复盘与 JD 差距会作为候选证据进入这里，用户确认后参与评分。</span>
          </article>
        </template>
      </section>
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

.tree-panel,
.ability-panel,
.asset-card,
.feedback-source,
.empty-state {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.tree-panel,
.ability-panel {
  display: grid;
  gap: 13px;
  padding: 17px;
}

.tree-panel > header,
.ability-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tree-panel > header > div,
.ability-panel > header > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.tree-panel > header svg,
.ability-panel > header svg {
  color: var(--teal);
}

.tree-panel p:first-child,
.ability-panel p:first-child {
  margin: 0;
  color: var(--teal);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.tree-panel h3,
.ability-panel h3 {
  margin: 0;
  color: var(--ink);
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
  gap: 6px;
}

.growth-tree button {
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.growth-tree button::after {
  position: absolute;
  top: 31px;
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
  background: #e8f6f1;
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
  border-color: #3a75bf;
}

.stage-marker.is-practicing {
  border-color: #c79025;
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

.ability-panel {
  align-content: start;
}

.asset-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 13px;
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

.asset-card em {
  padding: 5px 7px;
  border-radius: 6px;
  background: #e8f6f1;
  color: var(--teal-dark);
  font-size: 10px;
  font-style: normal;
  font-weight: 850;
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
  .asset-card {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .asset-card > span,
  .asset-card em {
    justify-self: start;
  }
}
</style>
