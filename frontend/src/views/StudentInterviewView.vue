<script setup lang="ts">
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  ListTree,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy
} from "@lucide/vue";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDialog from "@/components/ui/WorkbenchDialog.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import type { CompanyOpportunity, ProcessStage, ProcessStageStatus } from "@/stores/studentWorkbench";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const { bindingLabel, bindingState, lastSyncTime, opportunities } = storeToRefs(store);

const syncCandidate = ref<CompanyOpportunity | null>(null);
const addCandidate = ref<CompanyOpportunity | null>(null);
const presetStageName = ref("二面");
const customStageName = ref("");
const presetStages = ["二面", "三面", "HR 面", "加面", "Offer", "自定义节点"];

const syncDialogOpen = computed({
  get: () => syncCandidate.value !== null,
  set: (open: boolean) => {
    if (!open) syncCandidate.value = null;
  }
});

const addDialogOpen = computed({
  get: () => addCandidate.value !== null,
  set: (open: boolean) => {
    if (!open) closeAddDialog();
  }
});

const newStageName = computed(() =>
  presetStageName.value === "自定义节点" ? customStageName.value.trim() : presetStageName.value
);

const summary = computed(() => {
  const currentStages = opportunities.value.map(currentStage);
  return {
    active: currentStages.filter((stage) => stage.status === "active" || stage.status === "waiting").length,
    nextActions: opportunities.value.reduce(
      (count, opportunity) =>
        count +
        opportunity.stages.filter((stage) => stage.status === "active" || stage.status === "waiting").length,
      0
    ),
    interviews: currentStages.filter((stage) => /笔试|面试|一面|二面|三面|HR 面|加面/.test(stage.name)).length,
    offers: opportunities.value.filter((opportunity) => opportunity.stages.some((stage) => stage.status === "offer"))
      .length
  };
});

const statusText: Record<ProcessStageStatus, string> = {
  todo: "待开始",
  active: "进行中",
  waiting: "等待中",
  passed: "已通过",
  failed: "未通过",
  offer: "Offer"
};

function currentStage(opportunity: CompanyOpportunity): ProcessStage {
  return (
    opportunity.stages.find((stage) => stage.status === "active" || stage.status === "waiting") ??
    opportunity.stages.find((stage) => stage.status === "offer") ??
    opportunity.stages.find((stage) => stage.status === "todo") ??
    [...opportunity.stages].reverse().find((stage) => ["passed", "failed"].includes(stage.status)) ??
    opportunity.stages[0]
  );
}

function statusTone(status: ProcessStageStatus) {
  if (status === "passed" || status === "offer") return "success";
  if (status === "active") return "accent";
  if (status === "waiting" || status === "failed") return "warning";
  return "neutral";
}

function isOfferStage(stage: ProcessStage) {
  return /offer/i.test(stage.name);
}

function openAddDialog(opportunity: CompanyOpportunity) {
  presetStageName.value = "二面";
  customStageName.value = "";
  addCandidate.value = opportunity;
}

function closeAddDialog() {
  addCandidate.value = null;
  customStageName.value = "";
}

function addStage() {
  if (!addCandidate.value || !newStageName.value) return;
  store.addProcessStage(addCandidate.value.id, newStageName.value);
  closeAddDialog();
}
</script>

<template>
  <StudentWorkbenchModule
    eyebrow="Interview Trees"
    title="面试管理"
    description="以公司机会为节点，人工管理 JD、投递、每轮面试和 Offer。"
    agent-action="回 Agent 准备"
    :status="bindingState === 'bound' ? `已绑定 · ${lastSyncTime || '未同步'}` : bindingLabel"
  >
    <div class="pipeline-summary">
      <div>
        <span>进行中机会</span>
        <strong>{{ summary.active }}</strong>
        <small>当前有真实动作</small>
      </div>
      <div>
        <span>待处理节点</span>
        <strong>{{ summary.nextActions }}</strong>
        <small>进行中或等待信息</small>
      </div>
      <div>
        <span>面试节点</span>
        <strong>{{ summary.interviews }}</strong>
        <small>笔试或面试进行中</small>
      </div>
      <div>
        <span>Offer</span>
        <strong>{{ summary.offers }}</strong>
        <small>每一步都算数</small>
      </div>
    </div>

    <WorkbenchPanel
      eyebrow="Company Opportunities"
      title="公司机会流程树"
      :icon="ListTree"
      description="公司是节点，流程是链路；轮次不固定，节点由用户手工管理。"
    >
      <div class="opportunity-list">
        <article v-for="opportunity in opportunities" :key="opportunity.id">
          <header>
            <div>
              <strong>{{ opportunity.company }}</strong>
              <small>{{ opportunity.role }}</small>
              <p>{{ opportunity.nextAction }}</p>
            </div>
            <div>
              <WorkbenchStatus :tone="statusTone(currentStage(opportunity).status)">
                {{ currentStage(opportunity).name }}
              </WorkbenchStatus>
              <CircleCheck v-if="opportunity.synced" class="sync-done" :size="17" />
              <WorkbenchButton
                v-else
                size="sm"
                :disabled="bindingState !== 'bound'"
                @click="syncCandidate = opportunity"
              >
                同步摘要
              </WorkbenchButton>
            </div>
          </header>

          <ol class="stage-tree">
            <li v-for="stage in opportunity.stages" :key="stage.id" :class="`is-${stage.status}`">
              <span class="stage-marker"></span>
              <div class="stage-body">
                <div class="stage-title">
                  <strong>{{ stage.name }}</strong>
                  <WorkbenchStatus :tone="statusTone(stage.status)">
                    {{ statusText[stage.status] }}
                  </WorkbenchStatus>
                </div>
                <p>
                  <span v-if="stage.nextAction">{{ stage.nextAction }}</span>
                  <span v-if="stage.date">{{ stage.date }}</span>
                  {{ stage.note }}
                </p>
                <div class="stage-meta">
                  <span>Skill 预留 · {{ stage.skillName }}</span>
                  <span v-if="stage.artifact">{{ stage.artifact }}</span>
                </div>
                <em>
                  <Sparkles :size="13" />
                  {{ stage.encouragement }}
                </em>
                <div
                  v-if="stage.status === 'active' || stage.status === 'waiting'"
                  class="stage-actions"
                >
                  <WorkbenchButton
                    size="sm"
                    title="用户手工确认该节点通过"
                    @click="store.setProcessStageStatus(opportunity.id, stage.id, 'passed')"
                  >
                    <CircleCheck :size="14" />
                    已通过
                  </WorkbenchButton>
                  <WorkbenchButton
                    size="sm"
                    variant="danger"
                    title="用户手工标记该节点未通过"
                    @click="store.setProcessStageStatus(opportunity.id, stage.id, 'failed')"
                  >
                    <CircleX :size="14" />
                    未通过
                  </WorkbenchButton>
                  <WorkbenchButton
                    v-if="isOfferStage(stage)"
                    size="sm"
                    variant="dark"
                    title="用户手工确认 Offer"
                    @click="store.markProcessStageOffer(opportunity.id, stage.id)"
                  >
                    <Trophy :size="14" />
                    标记 Offer
                  </WorkbenchButton>
                </div>
                <div v-else-if="stage.status === 'todo'" class="stage-actions">
                  <WorkbenchButton
                    size="sm"
                    variant="ghost"
                    title="用户手工进入该节点"
                    @click="store.setProcessStageStatus(opportunity.id, stage.id, 'active')"
                  >
                    开始处理
                  </WorkbenchButton>
                  <WorkbenchButton
                    v-if="isOfferStage(stage)"
                    size="sm"
                    variant="dark"
                    title="用户手工确认 Offer"
                    @click="store.markProcessStageOffer(opportunity.id, stage.id)"
                  >
                    <Trophy :size="14" />
                    标记 Offer
                  </WorkbenchButton>
                </div>
                <div v-else-if="stage.status === 'passed' || stage.status === 'failed'" class="stage-actions">
                  <WorkbenchButton
                    size="sm"
                    variant="ghost"
                    title="重新打开该节点的人工判断"
                    @click="store.setProcessStageStatus(opportunity.id, stage.id, 'active')"
                  >
                    重新标记
                  </WorkbenchButton>
                </div>
                <div v-else class="offer-banner">
                  <Trophy :size="15" />
                  Offer 已确认，先归档邮件，再核对入职材料。
                </div>
              </div>
            </li>
          </ol>

          <footer>
            <WorkbenchButton size="sm" @click="openAddDialog(opportunity)">
              <Plus :size="14" />
              添加节点
            </WorkbenchButton>
            <ShieldCheck :size="15" />
          </footer>
        </article>
      </div>

      <p class="sync-note">
        只同步公司、岗位、当前节点、下一步和用户确认的状态；评估报告、简历全文、复盘原稿和本地备注不会上传。
      </p>
    </WorkbenchPanel>

    <WorkbenchDialog
      v-model:open="syncDialogOpen"
      title="同步求职摘要"
      :description="syncCandidate ? `${syncCandidate.company} · ${syncCandidate.role}` : ''"
    >
      <p>
        将同步公司、岗位、当前节点、下一步和用户确认的状态。岗位评估报告全文、简历全文和本地备注不会上传。
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

    <WorkbenchDialog
      v-model:open="addDialogOpen"
      title="添加流程节点"
      :description="addCandidate ? `${addCandidate.company} · ${addCandidate.role}` : ''"
    >
      <div class="stage-form">
        <label for="process-stage-preset">节点类型</label>
        <select id="process-stage-preset" v-model="presetStageName">
          <option v-for="stage in presetStages" :key="stage" :value="stage">
            {{ stage }}
          </option>
        </select>
        <template v-if="presetStageName === '自定义节点'">
          <label for="process-stage-name">节点名称</label>
          <input
            id="process-stage-name"
            v-model="customStageName"
            maxlength="18"
            placeholder="例如：交叉面"
            type="text"
          />
        </template>
        <p>节点会追加到该公司流程树末尾。面试轮次和真实流程由你定义，Agent 只提供建议和产物。</p>
      </div>
      <template #footer>
        <WorkbenchButton size="sm" @click="closeAddDialog">取消</WorkbenchButton>
        <WorkbenchButton size="sm" variant="primary" :disabled="!newStageName" @click="addStage">
          <Plus :size="15" />
          添加节点
        </WorkbenchButton>
      </template>
    </WorkbenchDialog>
  </StudentWorkbenchModule>
</template>

<style scoped>
.pipeline-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.pipeline-summary > div {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.pipeline-summary span,
.pipeline-summary small {
  color: var(--muted);
  font-size: 11px;
}

.pipeline-summary strong {
  color: var(--ink);
  font-size: 23px;
  line-height: 1;
}

.opportunity-list {
  display: grid;
  gap: 13px;
}

.opportunity-list article {
  min-width: 0;
  display: grid;
  gap: 13px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
}

.opportunity-list article > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.opportunity-list article > header > div:first-child {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.opportunity-list strong {
  color: var(--ink);
  font-size: 15px;
}

.opportunity-list small {
  color: var(--muted);
  font-size: 11px;
}

.opportunity-list article > header p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.opportunity-list article > header > div:last-child {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
}

.sync-done {
  color: var(--teal);
}

.stage-tree {
  position: relative;
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stage-tree li {
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
}

.stage-tree li::after {
  position: absolute;
  top: 23px;
  bottom: -10px;
  left: 8px;
  width: 2px;
  background: var(--line);
  content: "";
}

.stage-tree li:last-child::after {
  display: none;
}

.stage-marker {
  position: relative;
  z-index: 1;
  width: 14px;
  height: 14px;
  margin-top: 3px;
  border: 3px solid #a8b9b6;
  border-radius: 50%;
  background: #fff;
}

.stage-body {
  min-width: 0;
  display: grid;
  gap: 7px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
}

.stage-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.stage-title strong {
  font-size: 13px;
}

.stage-body > p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.stage-body > p > span {
  margin-right: 6px;
  padding: 2px 5px;
  border-radius: 5px;
  background: #edf7f4;
  color: var(--teal-dark);
  font-size: 11px;
  font-weight: 750;
}

.stage-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stage-meta span {
  max-width: 100%;
  overflow: hidden;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 10px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-body > em {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  color: #6f7f7c;
  font-size: 11px;
  font-style: normal;
  line-height: 1.5;
}

.stage-body > em > svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--gold);
}

.stage-actions,
.offer-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.offer-banner {
  padding: 8px 10px;
  border: 1px solid rgba(199, 144, 37, 0.28);
  border-radius: 7px;
  background: #fbf3e2;
  color: #7d5a12;
  font-size: 12px;
  font-weight: 750;
}

.offer-banner > svg {
  color: var(--gold);
}

.stage-tree li.is-active .stage-marker {
  border-color: var(--teal);
  box-shadow: 0 0 0 4px rgba(20, 123, 115, 0.12);
}

.stage-tree li.is-waiting .stage-marker {
  border-color: var(--gold);
}

.stage-tree li.is-passed .stage-marker,
.stage-tree li.is-offer .stage-marker {
  border-color: var(--teal);
  background: var(--teal);
}

.stage-tree li.is-failed .stage-marker {
  border-color: #b4483a;
}

.stage-tree li.is-offer .stage-body {
  border-color: rgba(199, 144, 37, 0.35);
}

.opportunity-list article > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.opportunity-list article > footer > svg {
  color: var(--teal);
}

.sync-note,
.stage-form p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.stage-form {
  display: grid;
  gap: 7px;
}

.stage-form label {
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}

.stage-form select,
.stage-form input {
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
  font-size: 13px;
}

.stage-form select:focus,
.stage-form input:focus {
  border-color: var(--teal);
  outline: 2px solid rgba(20, 123, 115, 0.16);
}

@media (max-width: 960px) {
  .pipeline-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .pipeline-summary {
    grid-template-columns: minmax(0, 1fr);
  }

  .opportunity-list article > header,
  .stage-title {
    align-items: stretch;
    flex-direction: column;
  }

  .opportunity-list article > header > div:last-child {
    justify-content: flex-start;
  }

  .stage-tree li {
    grid-template-columns: minmax(0, 1fr);
    padding-left: 10px;
  }

  .stage-marker {
    position: absolute;
    top: 17px;
    left: -4px;
  }

  .stage-tree li::after {
    top: 35px;
    bottom: -12px;
    left: 2px;
  }
}
</style>
