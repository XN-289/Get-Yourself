<script setup lang="ts">
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  GripVertical,
  ListTree,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy
} from "@lucide/vue";
import Sortable from "sortablejs";
import { computed, onBeforeUnmount, onMounted, ref, type ComponentPublicInstance } from "vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import LocalOpportunityBridge from "@/components/interview/LocalOpportunityBridge.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDialog from "@/components/ui/WorkbenchDialog.vue";
import WorkbenchDrawer from "@/components/ui/WorkbenchDrawer.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import type { CompanyOpportunity, ProcessStage, ProcessStageStatus } from "@/stores/studentWorkbench";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";

const store = useStudentWorkbenchStore();
const { bindingLabel, bindingState, lastSyncTime, opportunities } = storeToRefs(store);

const syncCandidate = ref<CompanyOpportunity | null>(null);
const addCandidate = ref<CompanyOpportunity | null>(null);
const stageDrawerCandidate = ref<{ opportunity: CompanyOpportunity; stage: ProcessStage } | null>(null);
const presetStageName = ref("二面");
const customStageName = ref("");
const presetStages = ["二面", "三面", "HR 面", "加面", "Offer", "自定义节点"];
const stageTreeElements = new Map<number, HTMLElement>();
const stageSortables: Sortable[] = [];

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

const stageDrawerOpen = computed({
  get: () => stageDrawerCandidate.value !== null,
  set: (open: boolean) => {
    if (!open) stageDrawerCandidate.value = null;
  }
});

const newStageName = computed(() =>
  presetStageName.value === "自定义节点" ? customStageName.value.trim() : presetStageName.value
);

const drawerStageIndex = computed(() => {
  const candidate = stageDrawerCandidate.value;
  if (!candidate) return -1;
  return candidate.opportunity.stages.findIndex((item) => item.id === candidate.stage.id);
});

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

function stageCategoryKey(stage: ProcessStage) {
  if (/jd/i.test(stage.name)) return "jd";
  if (/简历/.test(stage.name)) return "resume";
  if (/投递/.test(stage.name)) return "submission";
  if (isOfferStage(stage)) return "offer";
  if (/复盘|反哺|沉淀/.test(stage.name)) return "consolidation";
  if (/笔试|面试|一面|二面|三面|HR 面|加面|交叉面/.test(stage.name)) return "interview";
  return "process";
}

function stageCategoryLabel(stage: ProcessStage) {
  return (
    {
      jd: "JD 分析",
      resume: "简历",
      submission: "投递",
      interview: "面试",
      offer: "Offer",
      consolidation: "沉淀",
      process: "流程"
    } as const
  )[stageCategoryKey(stage)];
}

function stageClasses(stage: ProcessStage) {
  return [`is-${stage.status}`, `is-${stageCategoryKey(stage)}`];
}

function openStageDrawer(opportunity: CompanyOpportunity, stage: ProcessStage) {
  stageDrawerCandidate.value = { opportunity, stage };
}

function moveDrawerStage(direction: -1 | 1) {
  const candidate = stageDrawerCandidate.value;
  if (!candidate) return;
  const stageIndex = candidate.opportunity.stages.findIndex((item) => item.id === candidate.stage.id);
  if (stageIndex < 0) return;
  store.moveProcessStage(candidate.opportunity.id, candidate.stage.id, stageIndex + direction);
}

function updateStageStatus(status: ProcessStageStatus) {
  const candidate = stageDrawerCandidate.value;
  if (!candidate || candidate.stage.status === status) return;
  if (status === "offer") {
    store.markProcessStageOffer(candidate.opportunity.id, candidate.stage.id);
  } else {
    store.setProcessStageStatus(candidate.opportunity.id, candidate.stage.id, status);
  }
  stageDrawerCandidate.value = null;
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

function registerStageTree(element: Element | ComponentPublicInstance | null, opportunityId: number) {
  if (element instanceof HTMLElement) stageTreeElements.set(opportunityId, element);
  else stageTreeElements.delete(opportunityId);
}

function recordBridgeTrace(title: string, source: string, result: string) {
  store.addTrace(title, source, result);
}

onMounted(() => {
  for (const [opportunityId, element] of stageTreeElements) {
    stageSortables.push(
      Sortable.create(element, {
        animation: 150,
        chosenClass: "is-sort-chosen",
        dragClass: "is-sort-dragging",
        fallbackOnBody: true,
        forceFallback: true,
        direction: "horizontal",
        ghostClass: "is-sort-ghost",
        handle: ".stage-order",
        onEnd: (event) => {
          const opportunity = opportunities.value.find((item) => item.id === opportunityId);
          const stage = opportunity?.stages[event.oldIndex ?? -1];
          const targetIndex = event.newIndex;
          if (!opportunity || !stage || targetIndex === undefined || targetIndex === event.oldIndex) return;
          store.moveProcessStage(opportunityId, stage.id, targetIndex);
        }
      })
    );
  }
});

onBeforeUnmount(() => {
  stageSortables.forEach((sortable) => sortable.destroy());
  stageSortables.length = 0;
  stageTreeElements.clear();
});
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

          <ol
            :ref="(element) => registerStageTree(element, opportunity.id)"
            class="stage-tree"
          >
            <li v-for="stage in opportunity.stages" :key="stage.id" :class="stageClasses(stage)">
              <button
                class="stage-card"
                type="button"
                :title="`打开${stage.name}节点详情`"
                @click="openStageDrawer(opportunity, stage)"
              >
                <span
                  class="stage-order"
                  title="拖动节点排序"
                  aria-hidden="true"
                  @click.stop
                >
                  <GripVertical :size="14" />
                </span>
                <span class="stage-card-main">
                  <small>{{ stageCategoryLabel(stage) }}</small>
                  <strong>{{ stage.name }}</strong>
                  <span class="stage-state">
                    <span class="stage-state-dot"></span>
                    {{ statusText[stage.status] }}
                  </span>
                </span>
              </button>
              <div class="stage-quick" aria-label="切换节点状态">
                <button
                  class="stage-quick-button is-pass"
                  type="button"
                  title="打开状态切换：已通过"
                  :aria-label="`${opportunity.company}${stage.name}：切换为已通过`"
                  @click="openStageDrawer(opportunity, stage)"
                >
                  <CircleCheck :size="13" />
                </button>
                <button
                  class="stage-quick-button is-fail"
                  type="button"
                  title="打开状态切换：未通过"
                  :aria-label="`${opportunity.company}${stage.name}：切换为未通过`"
                  @click="openStageDrawer(opportunity, stage)"
                >
                  <CircleX :size="13" />
                </button>
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

    <LocalOpportunityBridge @trace="recordBridgeTrace" />

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
        <p>节点会追加到该公司流程树末尾，随后可拖拽调整顺序。面试轮次和真实流程由你定义，Agent 只提供建议和产物。</p>
      </div>
      <template #footer>
        <WorkbenchButton size="sm" @click="closeAddDialog">取消</WorkbenchButton>
        <WorkbenchButton size="sm" variant="primary" :disabled="!newStageName" @click="addStage">
          <Plus :size="15" />
          添加节点
        </WorkbenchButton>
      </template>
    </WorkbenchDialog>

    <WorkbenchDrawer
      v-model:open="stageDrawerOpen"
      title="节点操作台"
      :description="
        stageDrawerCandidate
          ? `${stageDrawerCandidate.opportunity.company} · ${stageDrawerCandidate.opportunity.role} · ${stageDrawerCandidate.stage.name}`
          : ''
      "
    >
      <div v-if="stageDrawerCandidate" class="stage-drawer">
        <section class="drawer-current">
          <WorkbenchStatus :tone="statusTone(stageDrawerCandidate.stage.status)">
            {{ statusText[stageDrawerCandidate.stage.status] }}
          </WorkbenchStatus>
          <p>
            {{ stageDrawerCandidate.stage.nextAction || stageDrawerCandidate.stage.note }}
          </p>
        </section>

        <dl class="stage-detail-list">
          <div v-if="stageDrawerCandidate.stage.date">
            <dt>时间</dt>
            <dd>{{ stageDrawerCandidate.stage.date }}</dd>
          </div>
          <div>
            <dt>说明</dt>
            <dd>{{ stageDrawerCandidate.stage.note }}</dd>
          </div>
          <div>
            <dt>Skill</dt>
            <dd>{{ stageDrawerCandidate.stage.skillName }}</dd>
          </div>
          <div v-if="stageDrawerCandidate.stage.artifact">
            <dt>产物</dt>
            <dd>{{ stageDrawerCandidate.stage.artifact }}</dd>
          </div>
        </dl>

        <p class="drawer-encouragement">
          <Sparkles :size="13" />
          {{ stageDrawerCandidate.stage.encouragement }}
        </p>

        <section class="drawer-section">
          <div class="drawer-section-head">
            <strong>节点顺序</strong>
            <span>拖拽把手或按左右移动</span>
          </div>
          <div class="drawer-order-actions">
            <WorkbenchButton
              size="sm"
              variant="ghost"
              title="左移节点"
              :disabled="drawerStageIndex <= 0"
              @click="moveDrawerStage(-1)"
            >
              <ChevronLeft :size="14" />
              左移
            </WorkbenchButton>
            <WorkbenchButton
              size="sm"
              variant="ghost"
              title="右移节点"
              :disabled="drawerStageIndex >= stageDrawerCandidate.opportunity.stages.length - 1"
              @click="moveDrawerStage(1)"
            >
              右移
              <ChevronRight :size="14" />
            </WorkbenchButton>
          </div>
        </section>

        <section class="drawer-section">
          <div class="drawer-section-head">
            <strong>状态切换</strong>
            <span>结果只由你确认</span>
          </div>
          <div class="drawer-status-actions">
            <WorkbenchButton
              size="sm"
              variant="secondary"
              :disabled="stageDrawerCandidate.stage.status === 'todo'"
              @click="updateStageStatus('todo')"
            >
              待开始
            </WorkbenchButton>
            <WorkbenchButton
              size="sm"
              variant="secondary"
              :disabled="stageDrawerCandidate.stage.status === 'active'"
              @click="updateStageStatus('active')"
            >
              开始处理
            </WorkbenchButton>
            <WorkbenchButton
              size="sm"
              variant="secondary"
              :disabled="stageDrawerCandidate.stage.status === 'waiting'"
              @click="updateStageStatus('waiting')"
            >
              等待信息
            </WorkbenchButton>
            <WorkbenchButton
              size="sm"
              variant="primary"
              :disabled="stageDrawerCandidate.stage.status === 'passed'"
              @click="updateStageStatus('passed')"
            >
              <CircleCheck :size="14" />
              已通过
            </WorkbenchButton>
            <WorkbenchButton
              size="sm"
              variant="danger"
              :disabled="stageDrawerCandidate.stage.status === 'failed'"
              @click="updateStageStatus('failed')"
            >
              <CircleX :size="14" />
              未通过
            </WorkbenchButton>
            <WorkbenchButton
              v-if="isOfferStage(stageDrawerCandidate.stage)"
              size="sm"
              variant="dark"
              :disabled="stageDrawerCandidate.stage.status === 'offer'"
              @click="updateStageStatus('offer')"
            >
              <Trophy :size="14" />
              确认 Offer
            </WorkbenchButton>
          </div>
        </section>
      </div>
      <template #footer>
        <WorkbenchButton size="sm" variant="ghost" @click="stageDrawerCandidate = null">关闭</WorkbenchButton>
      </template>
    </WorkbenchDrawer>
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
  min-width: 0;
  display: flex;
  gap: 16px;
  margin: 0;
  padding: 2px 2px 10px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  list-style: none;
  scroll-snap-type: x proximity;
}

.stage-tree::-webkit-scrollbar {
  height: 8px;
}

.stage-tree::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #d8d5cc;
}

.stage-tree li {
  position: relative;
  flex: 0 0 148px;
  min-height: 106px;
  scroll-snap-align: start;
  touch-action: pan-x;
}

.stage-tree li.is-interview {
  flex-basis: 160px;
}

.stage-tree li:not(:last-child)::after {
  position: absolute;
  top: 52px;
  left: 100%;
  width: 16px;
  height: 2px;
  background: #c9c5ba;
  content: "";
}

.stage-card {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 106px;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 4px;
  align-content: start;
  padding: 10px 9px 38px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 130ms ease,
    box-shadow 130ms ease,
    transform 130ms ease;
}

.stage-card::before {
  position: absolute;
  top: 0;
  right: 8px;
  left: 8px;
  height: 3px;
  border-radius: 0 0 4px 4px;
  background: #a8b9b6;
  content: "";
}

.stage-card:hover {
  border-color: rgba(20, 123, 115, 0.34);
  box-shadow: 0 8px 20px rgba(23, 33, 36, 0.07);
}

.stage-card:focus-visible {
  border-color: var(--teal);
  outline: 2px solid rgba(20, 123, 115, 0.22);
  outline-offset: 2px;
}

.stage-order {
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: #9aabaa;
  cursor: grab;
  touch-action: none;
}

.stage-order:hover {
  background: rgba(20, 123, 115, 0.08);
  color: var(--teal-dark);
}

.stage-card-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.stage-card-main small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.stage-card-main strong {
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.35;
}

.stage-state {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: inline-flex;
  max-width: 82px;
  overflow: hidden;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.stage-state-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a8b9b6;
}

.stage-quick {
  position: absolute;
  right: 9px;
  bottom: 7px;
  display: flex;
  gap: 3px;
}

.stage-quick-button {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
}

.stage-quick-button.is-pass {
  color: var(--teal-dark);
}

.stage-quick-button.is-fail {
  color: #b4483a;
}

.stage-quick-button:hover {
  border-color: currentColor;
}

.stage-quick-button:focus-visible {
  outline: 2px solid rgba(20, 123, 115, 0.22);
  outline-offset: 2px;
}

.stage-tree li.is-interview .stage-card {
  border-color: rgba(20, 123, 115, 0.32);
  background: #f6fbfa;
}

.stage-tree li.is-interview .stage-card::before {
  background: var(--teal);
}

.stage-tree li.is-offer .stage-card {
  border-color: rgba(199, 144, 37, 0.34);
  background: #fffaf0;
}

.stage-tree li.is-offer .stage-card::before {
  background: var(--gold);
}

.stage-tree li.is-active .stage-card {
  border-color: rgba(20, 123, 115, 0.44);
  box-shadow: 0 0 0 3px rgba(20, 123, 115, 0.09);
}

.stage-tree li.is-waiting .stage-state-dot {
  background: var(--gold);
}

.stage-tree li.is-active .stage-state-dot,
.stage-tree li.is-passed .stage-state-dot {
  background: var(--teal);
}

.stage-tree li.is-failed .stage-card {
  border-color: rgba(180, 72, 58, 0.34);
}

.stage-tree li.is-failed .stage-state-dot {
  background: #b4483a;
}

.stage-tree li.is-sort-ghost .stage-card {
  border-style: dashed;
  opacity: 0.44;
}

.stage-tree li.is-sort-dragging .stage-card {
  border-style: dashed;
}

.stage-tree li.is-sort-chosen .stage-card {
  border-color: rgba(20, 123, 115, 0.44);
  box-shadow: 0 12px 26px rgba(23, 33, 36, 0.12);
}

.stage-drawer {
  display: grid;
  gap: 16px;
}

.drawer-current {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(20, 123, 115, 0.18);
  border-radius: 8px;
  background: #f6fbfa;
}

.drawer-current p {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.6;
}

.stage-detail-list {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.stage-detail-list > div {
  display: grid;
  grid-template-columns: 66px minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}

.stage-detail-list > div:last-child {
  border-bottom: 0;
}

.stage-detail-list dt {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.stage-detail-list dd {
  margin: 0;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.drawer-encouragement {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  padding: 10px 11px;
  border: 1px solid rgba(199, 144, 37, 0.24);
  border-radius: 8px;
  background: #fffaf0;
  color: #7d5a1d;
  font-size: 12px;
  line-height: 1.6;
}

.drawer-encouragement svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.drawer-section {
  display: grid;
  gap: 10px;
}

.drawer-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.drawer-section-head strong {
  color: var(--ink);
  font-size: 13px;
}

.drawer-section-head span {
  color: var(--muted);
  font-size: 11px;
}

.drawer-order-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.drawer-status-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
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

  .opportunity-list article > header {
    align-items: stretch;
    flex-direction: column;
  }

  .opportunity-list article > header > div:last-child {
    justify-content: flex-start;
  }

  .stage-tree {
    padding-bottom: 12px;
  }

  .drawer-order-actions,
  .drawer-status-actions {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
