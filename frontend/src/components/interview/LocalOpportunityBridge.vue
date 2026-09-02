<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileUp,
  HardDrive,
  Plus,
  Trash2
} from "@lucide/vue";
import { computed, ref } from "vue";

import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDialog from "@/components/ui/WorkbenchDialog.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import {
  buildCompanyOpportunityNodeMutationPlan,
  createLocalProcessNode,
  importLocalOpportunity,
  type CompanyOpportunityNodeMutationPlan,
  type ImportedLocalOpportunity,
  type LocalProcessNode,
  type LocalProcessNodeStatus,
  type LocalProcessNodeType
} from "@/utils/companyOpportunity";

const emit = defineEmits<{
  trace: [title: string, source: string, result: string];
}>();

const importInput = ref<HTMLInputElement | null>(null);
const imported = ref<ImportedLocalOpportunity | null>(null);
const draftNodes = ref<LocalProcessNode[]>([]);
const changeSummary = ref("");
const bridgeError = ref("");
const confirmOpen = ref(false);
const exportedPlan = ref<CompanyOpportunityNodeMutationPlan | null>(null);
const exportedAt = ref("");
const newNodeTitle = ref("");
const newNodeType = ref<LocalProcessNodeType>("interview");
let newNodeSeed = 1;

const nodeTypeOptions: Array<{ value: LocalProcessNodeType; label: string }> = [
  { value: "jd_analysis", label: "JD 分析" },
  { value: "resume_adaptation", label: "简历适配" },
  { value: "submission", label: "投递" },
  { value: "interview", label: "面试" },
  { value: "offer", label: "Offer" },
  { value: "review_sedimentation", label: "复盘沉淀" },
  { value: "custom", label: "自定义" }
];

const statusOptions: Array<{ value: LocalProcessNodeStatus; label: string }> = [
  { value: "todo", label: "待开始" },
  { value: "active", label: "进行中" },
  { value: "waiting", label: "等待中" },
  { value: "passed", label: "已通过" },
  { value: "failed", label: "未通过" },
  { value: "offer", label: "Offer" }
];

const sourceNodes = computed(() => imported.value?.opportunity.processNodes ?? []);
const sourceIds = computed(() => sourceNodes.value.map(node => node.id).join("|"));
const targetIds = computed(() => draftNodes.value.map(node => node.id).join("|"));
const targetIdsSet = computed(() => new Set(draftNodes.value.map(node => node.id)));
const sourceNodesById = computed(() => new Map(sourceNodes.value.map(node => [node.id, node])));

const changeStats = computed(() => {
  if (!imported.value) {
    return { added: 0, removed: 0, fieldChanged: 0, reordered: false, changed: false };
  }
  const added = draftNodes.value.filter(node => !sourceNodesById.value.has(node.id)).length;
  const removed = sourceNodes.value.filter(node => !targetIdsSet.value.has(node.id)).length;
  const fieldChanged = draftNodes.value.filter(node => {
    const source = sourceNodesById.value.get(node.id);
    return source !== undefined
      && (source.status !== node.status || source.type !== node.type || source.title !== node.title);
  }).length;
  const reordered = sourceIds.value !== targetIds.value;
  return {
    added,
    removed,
    fieldChanged,
    reordered,
    changed: added > 0 || removed > 0 || fieldChanged > 0 || reordered
  };
});

const canAddNode = computed(() => newNodeTitle.value.trim().length >= 2 && newNodeTitle.value.trim().length <= 80);
const canExport = computed(
  () =>
    imported.value !== null
    && changeStats.value.changed
    && changeSummary.value.trim().length >= 2
    && changeSummary.value.trim().length <= 500
    && draftNodes.value.length > 0
);

const planFileName = computed(() =>
  exportedPlan.value ? `get-yourself-node-mutation-${exportedPlan.value.mutationId}.json` : ""
);

function statusLabel(status: LocalProcessNodeStatus) {
  return statusOptions.find(option => option.value === status)?.label ?? status;
}

function statusTone(status: LocalProcessNodeStatus) {
  if (status === "passed" || status === "offer") return "success" as const;
  if (status === "active") return "accent" as const;
  if (status === "waiting" || status === "failed") return "warning" as const;
  return "neutral" as const;
}

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  bridgeError.value = "";
  if (!file) return;
  if (file.size > 128 * 1024) {
    bridgeError.value = "本地机会文件超过 128KB";
    input.value = "";
    return;
  }

  try {
    const result = await importLocalOpportunity(await file.text(), file.name);
    imported.value = result;
    draftNodes.value = result.opportunity.processNodes.map(node => ({ ...node }));
    changeSummary.value = `更新 ${result.opportunity.processNodes.length} 个流程节点`;
    exportedPlan.value = null;
    exportedAt.value = "";
  } catch (error) {
    bridgeError.value = error instanceof Error ? error.message : "本地机会导入失败";
  } finally {
    input.value = "";
  }
}

function addNode() {
  if (!canAddNode.value) return;
  draftNodes.value.push(
    createLocalProcessNode({
      title: newNodeTitle.value,
      type: newNodeType.value,
      seed: newNodeSeed++
    })
  );
  newNodeTitle.value = "";
}

function removeNode(index: number) {
  draftNodes.value.splice(index, 1);
}

function moveNode(index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= draftNodes.value.length) return;
  const [node] = draftNodes.value.splice(index, 1);
  draftNodes.value.splice(targetIndex, 0, node);
}

function downloadPlan() {
  if (!imported.value) return;
  try {
    const plan = buildCompanyOpportunityNodeMutationPlan({
      imported: imported.value,
      processNodes: draftNodes.value,
      changeSummary: changeSummary.value
    });
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `get-yourself-node-mutation-${plan.mutationId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    exportedPlan.value = plan;
    exportedAt.value = new Date().toLocaleTimeString();
    confirmOpen.value = false;
    emit(
      "trace",
      "节点 mutation 计划导出",
      `${imported.value.opportunity.company} · ${imported.value.opportunity.role}`,
      `计划绑定本地机会哈希 ${imported.value.contentHash}，落盘仍需 CLI dry-run 和显式 --apply`
    );
  } catch (error) {
    bridgeError.value = error instanceof Error ? error.message : "节点计划生成失败";
  }
}
</script>

<template>
  <WorkbenchPanel
    eyebrow="Local Bridge"
    title="本地流程桥"
    :icon="HardDrive"
    description="读取本地公司机会 JSON，生成绑定当前哈希的完整节点 mutation 计划。"
  >
    <template #actions>
      <input
        ref="importInput"
        class="file-input"
        type="file"
        accept=".json,application/json"
        @change="handleImportChange"
      >
      <WorkbenchButton size="sm" variant="primary" @click="importInput?.click()">
        <FileUp :size="14" />
        读取机会 JSON
      </WorkbenchButton>
    </template>

    <p v-if="bridgeError" class="state-error" role="alert">{{ bridgeError }}</p>

    <div v-if="!imported" class="empty-state">
      <HardDrive :size="22" />
      <span>尚未读取本地公司机会</span>
    </div>

    <template v-else>
      <dl class="bridge-summary">
        <div>
          <dt>公司机会</dt>
          <dd>{{ imported.opportunity.company }} · {{ imported.opportunity.role }}</dd>
        </div>
        <div>
          <dt>批次 / 地点</dt>
          <dd>{{ imported.opportunity.recruitmentBatch }} · {{ imported.opportunity.location }}</dd>
        </div>
        <div>
          <dt>来源文件</dt>
          <dd>{{ imported.fileName }}</dd>
        </div>
        <div>
          <dt>当前内容哈希</dt>
          <dd :title="imported.contentHash">{{ imported.contentHash.slice(0, 20) }}…</dd>
        </div>
      </dl>

      <div class="node-editor">
        <header>
          <strong>目标节点列表</strong>
          <WorkbenchStatus :tone="changeStats.changed ? 'accent' : 'neutral'">
            {{ changeStats.changed ? "有变更" : "未变更" }}
          </WorkbenchStatus>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">顺序</th>
                <th scope="col">节点</th>
                <th scope="col">类型</th>
                <th scope="col">状态</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(node, index) in draftNodes" :key="node.id">
                <td>{{ index + 1 }}</td>
                <td>
                  <input v-model="node.title" maxlength="80" type="text" :aria-label="`第 ${index + 1} 个节点名称`">
                </td>
                <td>
                  <select v-model="node.type" :aria-label="`第 ${index + 1} 个节点类型`">
                    <option v-for="option in nodeTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </td>
                <td>
                  <WorkbenchStatus :tone="statusTone(node.status)">
                    {{ statusLabel(node.status) }}
                  </WorkbenchStatus>
                  <select v-model="node.status" :aria-label="`第 ${index + 1} 个节点状态`">
                    <option v-for="option in statusOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </td>
                <td>
                  <div class="row-actions">
                    <button type="button" title="上移节点" :disabled="index === 0" @click="moveNode(index, -1)">
                      <ArrowUp :size="13" />
                    </button>
                    <button
                      type="button"
                      title="下移节点"
                      :disabled="index === draftNodes.length - 1"
                      @click="moveNode(index, 1)"
                    >
                      <ArrowDown :size="13" />
                    </button>
                    <button type="button" title="删除节点" @click="removeNode(index)">
                      <Trash2 :size="13" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <form class="node-adder" @submit.prevent="addNode">
          <input v-model="newNodeTitle" maxlength="80" placeholder="节点名称" type="text">
          <select v-model="newNodeType">
            <option v-for="option in nodeTypeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <WorkbenchButton type="submit" size="sm" :disabled="!canAddNode">
            <Plus :size="14" />
            添加
          </WorkbenchButton>
        </form>
      </div>

      <label class="change-summary">
        变更说明
        <input v-model="changeSummary" maxlength="500" type="text">
      </label>

      <footer class="bridge-footer">
        <div v-if="exportedPlan" class="command-list">
          <span>{{ planFileName }} · {{ exportedAt }}</span>
          <code>node company-opportunity.mjs mutate-nodes {{ planFileName }}</code>
          <code>node company-opportunity.mjs mutate-nodes {{ planFileName }} --apply</code>
        </div>
        <WorkbenchButton size="sm" variant="dark" :disabled="!canExport" @click="confirmOpen = true">
          <Download :size="14" />
          导出节点计划
        </WorkbenchButton>
      </footer>
    </template>

    <WorkbenchDialog
      v-model:open="confirmOpen"
      title="确认节点计划"
      :description="imported ? `${imported.opportunity.company} · ${imported.opportunity.role}` : ''"
    >
      <dl class="confirm-list">
        <div>
          <dt>新增节点</dt>
          <dd>{{ changeStats.added }}</dd>
        </div>
        <div>
          <dt>删除节点</dt>
          <dd>{{ changeStats.removed }}</dd>
        </div>
        <div>
          <dt>字段修改</dt>
          <dd>{{ changeStats.fieldChanged }}</dd>
        </div>
        <div>
          <dt>顺序变化</dt>
          <dd>{{ changeStats.reordered ? "是" : "否" }}</dd>
        </div>
      </dl>
      <p>
        计划会绑定当前机会哈希；下载后先 dry-run，确认结果再用显式 --apply 写回本地。投递清单状态、skill 执行和产物挂载不在本次计划内。
      </p>
      <template #footer>
        <WorkbenchButton size="sm" @click="confirmOpen = false">取消</WorkbenchButton>
        <WorkbenchButton size="sm" variant="primary" @click="downloadPlan">
          <Download :size="15" />
          确认导出
        </WorkbenchButton>
      </template>
    </WorkbenchDialog>
  </WorkbenchPanel>
</template>

<style scoped>
.file-input {
  display: none;
}

.state-error {
  margin: 0;
  padding: 9px 11px;
  border: 1px solid rgba(180, 72, 58, 0.28);
  border-radius: 7px;
  background: #fdf1ef;
  color: #8f3428;
  font-size: 12px;
  line-height: 1.5;
}

.empty-state {
  min-height: 88px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 12px;
}

.bridge-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.bridge-summary > div {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
}

.bridge-summary dt {
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
}

.bridge-summary dd {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-editor {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.node-editor > header,
.bridge-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.node-editor > header strong {
  color: var(--ink);
  font-size: 13px;
}

.table-wrap {
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}

th,
td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  font-size: 12px;
  text-align: left;
  vertical-align: middle;
}

th {
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
}

tr:last-child td {
  border-bottom: 0;
}

td:first-child {
  width: 42px;
  color: var(--muted);
  font-weight: 800;
}

input,
select {
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--ink);
  font-size: 12px;
}

input:focus,
select:focus {
  border-color: var(--teal);
  outline: 2px solid rgba(20, 123, 115, 0.14);
}

td input {
  width: 180px;
}

td:nth-child(4) {
  min-width: 154px;
}

td:nth-child(4) select {
  margin-top: 5px;
  width: 104px;
}

.row-actions {
  display: flex;
  gap: 4px;
}

.row-actions button {
  width: 27px;
  height: 27px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--muted);
  cursor: pointer;
}

.row-actions button:hover:not(:disabled) {
  border-color: currentColor;
  color: var(--teal-dark);
}

.row-actions button:last-child:hover:not(:disabled) {
  color: #b4483a;
}

.row-actions button:focus-visible {
  outline: 2px solid rgba(20, 123, 115, 0.2);
  outline-offset: 2px;
}

.row-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.node-adder {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 128px auto;
  gap: 8px;
}

.node-adder input,
.node-adder select {
  width: 100%;
}

.change-summary {
  display: grid;
  gap: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}

.change-summary input {
  width: 100%;
}

.bridge-footer {
  align-items: flex-end;
}

.command-list {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.command-list span {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-list code {
  overflow: hidden;
  color: var(--teal-dark);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confirm-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.confirm-list > div {
  display: grid;
  gap: 2px;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
}

.confirm-list dt {
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
}

.confirm-list dd {
  margin: 0;
  color: var(--ink);
  font-size: 16px;
}

.workbench-dialog p {
  margin: 0;
}

@media (max-width: 960px) {
  .bridge-summary,
  .confirm-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .node-editor > header,
  .bridge-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .bridge-summary,
  .confirm-list,
  .node-adder {
    grid-template-columns: minmax(0, 1fr);
  }

  .command-list code {
    white-space: normal;
    word-break: break-all;
  }
}
</style>
