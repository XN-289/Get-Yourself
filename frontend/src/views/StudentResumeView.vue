<script setup lang="ts">
import {
  CircleCheck,
  FilePenLine,
  FilePlus2,
  FileText,
  FileUp,
  HardDrive,
  History,
  Save,
  Send
} from "@lucide/vue";
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";

import AgentMarkdown from "@/components/agent/AgentMarkdown.vue";
import LocalResumeLibraryBridge from "@/components/resume/LocalResumeLibraryBridge.vue";
import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDrawer from "@/components/ui/WorkbenchDrawer.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import type {
  ResumeDocument,
  ResumeVersion,
  ResumeVersionStatus
} from "@/stores/studentWorkbench";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";
import { documentInputFromText } from "@/utils/resumeImport";

const store = useStudentWorkbenchStore();
const { resumeDocuments, resumeTemplates } = storeToRefs(store);

const importInput = ref<HTMLInputElement | null>(null);
const importError = ref("");
const MAX_RESUME_IMPORT_BYTES = 2 * 1024 * 1024;
const editorError = ref("");
const editorOpen = ref(false);
const editorMode = ref<"create" | "edit">("edit");
const historyOpen = ref(false);
const initialDocument = resumeDocuments.value[0] ?? null;
const selectedDocumentId = ref<number | null>(initialDocument?.id ?? null);
const selectedVersionId = ref<number | null>(initialDocument?.activeVersionId ?? null);
const form = reactive({
  title: "",
  targetRole: "",
  templateId: "classic-ats",
  changeNote: "初稿",
  content: ""
});

const BLANK_RESUME_TEMPLATE = `# 你的姓名 · 目标岗位

## 个人信息
- 城市 / 邮箱 / 电话

## 教育经历
- 学校 · 专业 · 学历 · 时间

## 实习与项目
- 用“做了什么 + 结果是什么”写每一条经历
`;

const statusLabel: Record<ResumeVersionStatus, string> = {
  draft: "草稿",
  final: "已定稿",
  exported: "已导出"
};

const sourceLabel: Record<ResumeVersion["source"], string> = {
  agent: "Agent",
  import: "导入",
  manual: "手工"
};

const selectedDocument = computed(
  () => resumeDocuments.value.find((item) => item.id === selectedDocumentId.value) ?? resumeDocuments.value[0] ?? null
);

const selectedVersion = computed(() => {
  const document = selectedDocument.value;
  if (!document) return null;
  return (
    document.versions.find((item) => item.id === selectedVersionId.value) ??
    document.versions.find((item) => item.id === document.activeVersionId) ??
    document.versions[0] ??
    null
  );
});

const activeVersion = computed(() => {
  const document = selectedDocument.value;
  if (!document) return null;
  return document.versions.find((item) => item.id === document.activeVersionId) ?? document.versions[0] ?? null;
});

const lineDraft = computed(() => {
  const document = selectedDocument.value;
  return document?.versions.find((item) => item.status === "draft") ?? null;
});

const groupedDocuments = computed(() => {
  const groups = new Map<string, ResumeDocument[]>();
  for (const document of resumeDocuments.value) {
    const documents = groups.get(document.targetRole) ?? [];
    documents.push(document);
    groups.set(document.targetRole, documents);
  }
  return [...groups.entries()].map(([targetRole, documents]) => ({ targetRole, documents }));
});

const nextStep = computed(() => {
  if (!selectedDocument.value || !activeVersion.value) return null;
  if (lineDraft.value) {
    return {
      title: `先完成 v${lineDraft.value.version} 草稿`,
      description: `${lineDraft.value.changeNote} · 确认定稿后才能导出或投递`
    };
  }
  if (activeVersion.value.status === "exported") {
    return {
      title: "这份简历已投出",
      description: `${sourceLabel[activeVersion.value.source]}来源 · ${activeVersion.value.updatedAt}更新`
    };
  }
  return {
    title: `v${activeVersion.value.version} 可以投递`,
    description: `${templateName(activeVersion.value.templateId)} · ${activeVersion.value.updatedAt}更新`
  };
});

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  importError.value = "";
  if (!file) return;
  if (file.size > MAX_RESUME_IMPORT_BYTES) {
    importError.value = "简历文件超过 2MB";
    input.value = "";
    return;
  }

  try {
    const imported = store.importResumeDocument(await documentInputFromText(await file.text(), file.name));
    selectDocument(imported);
  } catch (error) {
    importError.value = error instanceof Error ? error.message : "简历导入失败";
  } finally {
    input.value = "";
  }
}

function selectDocument(document: ResumeDocument) {
  selectedDocumentId.value = document.id;
  selectedVersionId.value = document.activeVersionId;
  historyOpen.value = false;
}

function selectVersion(document: ResumeDocument, version: ResumeVersion) {
  selectedDocumentId.value = document.id;
  selectedVersionId.value = version.id;
}

function sortedVersions(document: ResumeDocument) {
  return [...document.versions].sort((a, b) => b.version - a.version);
}

function currentVersion(document: ResumeDocument) {
  return document.versions.find((item) => item.id === document.activeVersionId) ?? document.versions[0];
}

function documentDraft(document: ResumeDocument) {
  return document.versions.find((item) => item.status === "draft") ?? null;
}

function openDraft(document: ResumeDocument, version: ResumeVersion) {
  editorError.value = "";
  selectedDocumentId.value = document.id;
  selectedVersionId.value = version.id;
  Object.assign(form, {
    title: document.title,
    targetRole: document.targetRole,
    templateId: version.templateId,
    changeNote: version.changeNote,
    content: version.content
  });
  editorMode.value = "edit";
  editorOpen.value = true;
}

function startCreating() {
  editorError.value = "";
  editorMode.value = "create";
  Object.assign(form, {
    title: "我的新简历",
    targetRole: "未标注岗位",
    templateId: resumeTemplates.value[0]?.id ?? "classic-ats",
    changeNote: "初稿",
    content: BLANK_RESUME_TEMPLATE
  });
  editorOpen.value = true;
}

function startEditing() {
  const document = selectedDocument.value;
  const version = activeVersion.value;
  if (!document || !version) return;
  try {
    const draft = documentDraft(document);
    if (draft) {
      openDraft(document, draft);
      return;
    }
    const created = store.createResumeDraft(document.id, version.id, {
      title: document.title,
      targetRole: document.targetRole,
      templateId: version.templateId,
      content: version.content,
      source: "manual",
      changeNote: `从 v${version.version} 继续`
    });
    openDraft(document, created);
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : "无法创建草稿";
  }
}

function saveEditor() {
  if (editorMode.value === "create") {
    try {
      const created = store.createResumeDocument({ ...form });
      selectDocument(created);
      selectedVersionId.value = created.versions[0].id;
      editorOpen.value = false;
    } catch (error) {
      editorError.value = error instanceof Error ? error.message : "简历创建失败";
    }
    return;
  }

  const document = selectedDocument.value;
  const version = selectedVersion.value;
  if (!document || !version) return;
  try {
    store.updateResumeDraft(document.id, version.id, { ...form });
    editorOpen.value = false;
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : "简历保存失败";
  }
}

function confirmDraft() {
  const document = selectedDocument.value;
  const draft = lineDraft.value;
  if (!document || !draft) return;
  store.finalizeResumeVersion(document.id, draft.id);
  selectedVersionId.value = draft.id;
}

function markExported() {
  const document = selectedDocument.value;
  const version = activeVersion.value;
  if (!document || !version || version.status !== "final") return;
  store.markResumeVersionExported(document.id, version.id);
}

function setCurrentVersion(version: ResumeVersion) {
  const document = selectedDocument.value;
  if (!document) return;
  store.setActiveResumeVersion(document.id, version.id);
}

function templateName(templateId: string) {
  return resumeTemplates.value.find((template) => template.id === templateId)?.nameZh ?? "经典 ATS";
}

function statusTone(status: ResumeVersionStatus) {
  if (status === "exported") return "success" as const;
  if (status === "final") return "accent" as const;
  return "warning" as const;
}
</script>

<template>
  <StudentWorkbenchModule
    eyebrow="Resume Manager"
    title="简历管理"
    description="成品简历按岗位方向归档；修改生成草稿，确认后替换投递版。"
    agent-action="回 Agent 生成"
    status="本机会话"
  >
    <div class="resume-toolbar">
      <div>
        <strong>我的成品简历</strong>
        <span>{{ resumeDocuments.length }} 份 · 按岗位方向归类</span>
      </div>
      <div class="toolbar-actions">
        <input
          ref="importInput"
          class="file-input"
          type="file"
          accept=".json,.md,.txt,.html"
          @change="handleImportChange"
        >
        <WorkbenchButton @click="importInput?.click()">
          <FileUp :size="15" />
          导入简历
        </WorkbenchButton>
        <WorkbenchButton variant="primary" @click="startCreating">
          <FilePlus2 :size="15" />
          新建简历
        </WorkbenchButton>
      </div>
    </div>

    <p v-if="importError" class="state-error" role="alert">{{ importError }}</p>

    <div v-if="selectedDocument && selectedVersion" class="resume-layout">
      <aside class="resume-list" aria-label="简历列表">
        <section v-for="group in groupedDocuments" :key="group.targetRole" class="resume-group">
          <h4>{{ group.targetRole }}</h4>
          <button
            v-for="document in group.documents"
            :key="document.id"
            type="button"
            :class="{ 'is-selected': document.id === selectedDocument.id }"
            @click="selectDocument(document)"
          >
            <span class="resume-title">
              <strong>{{ document.title }}</strong>
              <CircleCheck
                v-if="currentVersion(document).status !== 'draft'"
                :size="15"
                aria-label="已有投递版"
              />
            </span>
            <small>当前 v{{ currentVersion(document).version }} · {{ statusLabel[currentVersion(document).status] }}</small>
            <span v-if="documentDraft(document)" class="draft-pill">
              草稿 v{{ documentDraft(document)?.version }} 待确认
            </span>
          </button>
        </section>

        <button type="button" class="create-inline" @click="startCreating">
          <FilePlus2 :size="15" />
          新建一份
        </button>
      </aside>

      <main class="resume-workspace">
        <header class="resume-heading">
          <div>
            <div class="heading-meta">
              <WorkbenchStatus :tone="statusTone(activeVersion?.status ?? 'draft')">
                {{ statusLabel[activeVersion?.status ?? "draft"] }}
              </WorkbenchStatus>
              <span>{{ sourceLabel[selectedVersion.source] }}</span>
              <span>{{ selectedVersion.updatedAt }}</span>
            </div>
            <h3>{{ selectedDocument.title }}</h3>
            <p>{{ selectedDocument.targetRole }} · 当前 v{{ activeVersion?.version ?? "-" }} · {{ templateName(selectedVersion.templateId) }}</p>
          </div>
        </header>

        <section v-if="nextStep" class="next-step" :class="{ 'has-draft': lineDraft }">
          <div>
            <strong>{{ nextStep.title }}</strong>
            <p>{{ nextStep.description }}</p>
          </div>
          <div class="next-actions">
            <WorkbenchButton variant="primary" @click="startEditing">
              <FilePenLine :size="15" />
              {{ lineDraft ? "继续编辑" : "复制新草稿" }}
            </WorkbenchButton>
            <WorkbenchButton v-if="lineDraft" variant="secondary" @click="confirmDraft">
              <CircleCheck :size="15" />
              确认定稿
            </WorkbenchButton>
            <WorkbenchButton v-else-if="activeVersion?.status === 'final'" variant="secondary" @click="markExported">
              <Send :size="15" />
              标记已投出
            </WorkbenchButton>
          </div>
        </section>

        <section class="resume-preview" aria-label="简历预览">
          <header>
            <span>简历预览</span>
            <span>{{ selectedVersion.fileName ?? templateName(selectedVersion.templateId) }}</span>
          </header>
          <AgentMarkdown :content="selectedVersion.content" />
        </section>

        <section class="resume-history">
          <button type="button" @click="historyOpen = !historyOpen">
            <History :size="16" />
            <span>历史版本</span>
            <strong>{{ selectedDocument.versions.length }}</strong>
          </button>

          <div v-if="historyOpen" class="history-list">
            <article
              v-for="version in sortedVersions(selectedDocument)"
              :key="version.id"
              :class="{ 'is-selected': version.id === selectedVersion.id }"
            >
              <button type="button" class="history-select" @click="selectVersion(selectedDocument, version)">
                <span class="history-version">v{{ version.version }}</span>
                <span class="history-copy">
                  <strong>{{ statusLabel[version.status] }}</strong>
                  <small>{{ version.changeNote }}</small>
                </span>
                <span class="history-time">{{ version.updatedAt }}</span>
              </button>
              <WorkbenchButton
                v-if="version.status !== 'draft' && version.id !== selectedDocument.activeVersionId"
                size="sm"
                @click="setCurrentVersion(version)"
              >
                设为当前
              </WorkbenchButton>
              <CircleCheck
                v-if="version.id === selectedDocument.activeVersionId"
                class="current-mark"
                :size="15"
                aria-label="当前投递版"
              />
            </article>
          </div>
        </section>

        <details class="advanced-library">
          <summary>
            <HardDrive :size="16" />
            本机简历文件
          </summary>
          <LocalResumeLibraryBridge />
        </details>
      </main>
    </div>

    <div v-else class="empty-state">
      <FileText :size="18" />
      <span>还没有成品简历</span>
      <WorkbenchButton variant="primary" @click="startCreating">
        <FilePlus2 :size="15" />
        新建简历
      </WorkbenchButton>
    </div>

    <WorkbenchDrawer
      v-model:open="editorOpen"
      size="lg"
      :title="editorMode === 'create' ? '新建简历' : selectedDocument?.title ?? '编辑简历草稿'"
      :description="editorMode === 'create' ? '先建立一份可编辑草稿。' : '保存不会覆盖已定稿版本。'"
    >
      <div class="resume-editor">
        <div class="editor-grid">
          <label>
            简历名称
            <input v-model="form.title" type="text" maxlength="60">
          </label>
          <label>
            目标岗位
            <input v-model="form.targetRole" type="text" maxlength="40">
          </label>
          <label>
            模板
            <select v-model="form.templateId">
              <option v-for="template in resumeTemplates" :key="template.id" :value="template.id">
                {{ template.nameZh }}
              </option>
            </select>
          </label>
          <label>
            版本说明
            <input v-model="form.changeNote" type="text" maxlength="36">
          </label>
        </div>

        <label>
          简历内容
          <textarea v-model="form.content" rows="20" spellcheck="false"></textarea>
        </label>

        <p v-if="editorError" class="state-error" role="alert">{{ editorError }}</p>
      </div>

      <template #footer>
        <WorkbenchButton variant="secondary" @click="editorOpen = false">取消</WorkbenchButton>
        <WorkbenchButton variant="primary" @click="saveEditor">
          <Save :size="15" />
          {{ editorMode === "create" ? "创建草稿" : "保存草稿" }}
        </WorkbenchButton>
      </template>
    </WorkbenchDrawer>
  </StudentWorkbenchModule>
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

.resume-toolbar,
.resume-list,
.resume-heading,
.next-step,
.resume-preview,
.resume-history {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.resume-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 15px;
}

.resume-toolbar > div:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.resume-toolbar strong {
  color: var(--ink);
  font-size: 15px;
}

.resume-toolbar span {
  color: var(--muted);
  font-size: 12px;
}

.toolbar-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.resume-layout {
  min-width: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.resume-list {
  min-width: 0;
  display: grid;
  gap: 13px;
  padding: 12px;
}

.resume-group {
  min-width: 0;
  display: grid;
  gap: 7px;
}

.resume-group h4 {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
}

.resume-list > button {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.resume-list > button:hover,
.resume-list > button:focus-visible,
.resume-list > button.is-selected {
  border-color: rgba(20, 123, 115, 0.4);
  background: #edf7f4;
  outline: none;
}

.resume-title {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  color: var(--teal);
}

.resume-title strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resume-list small {
  color: var(--muted);
  font-size: 11px;
}

.draft-pill {
  justify-self:start;
  padding: 3px 6px;
  border-radius: 5px;
  background: rgba(238, 166, 71, 0.16);
  color: #916018;
  font-size: 10.5px;
  font-weight: 850;
}

.create-inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  border: 1px dashed var(--line);
  border-radius: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}

.create-inline:hover,
.create-inline:focus-visible {
  border-color: rgba(20, 123, 115, 0.4);
  color: var(--teal-dark);
  outline: none;
}

.resume-workspace {
  min-width: 0;
  display: grid;
  gap: 13px;
}

.resume-heading {
  display: grid;
  gap: 9px;
  padding: 15px;
}

.heading-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
}

.resume-heading h3 {
  margin: 0;
  color: var(--ink);
  font-size: 21px;
  line-height: 1.3;
}

.resume-heading p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.next-step {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 15px;
  background: var(--surface-soft);
}

.next-step.has-draft {
  border-color: rgba(238, 166, 71, 0.36);
  background: #fffaf1;
}

.next-step > div:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.next-step strong {
  color: var(--ink);
  font-size: 14px;
}

.next-step p {
  margin: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.next-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.resume-preview {
  min-width: 0;
  display: grid;
  overflow: hidden;
}

.resume-preview > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  background: #fbfdfd;
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
}

.resume-preview > header span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resume-preview > :deep(.agent-markdown) {
  max-height: 560px;
  overflow-y: auto;
  padding: 24px clamp(18px, 4vw, 46px);
  background: #fff;
}

.resume-preview > :deep(.agent-markdown h1) {
  margin: 0;
  color: var(--ink);
  font-size: 23px;
  line-height: 1.3;
}

.resume-preview > :deep(.agent-markdown h2) {
  margin: 16px 0 0;
  border-bottom: 1px solid var(--line);
  padding-bottom: 5px;
  color: var(--ink);
  font-size: 15px;
}

.resume-preview > :deep(.agent-markdown h3) {
  margin: 11px 0 0;
  color: var(--ink);
  font-size: 13px;
}

.resume-preview > :deep(.agent-markdown li) {
  color: var(--ink);
}

.resume-history {
  min-width: 0;
  display: grid;
  overflow: hidden;
}

.resume-history > button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border: 0;
  background: #fff;
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 850;
  text-align: left;
  cursor: pointer;
}

.resume-history > button:hover,
.resume-history > button:focus-visible {
  background: var(--surface-soft);
  outline: none;
}

.resume-history > button strong {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}

.history-list {
  display: grid;
  border-top: 1px solid var(--line);
}

.history-list > article {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  border: 0;
  border-top: 1px solid var(--line);
  background: #fbfdfd;
  color: inherit;
}

.history-list > article:first-child {
  border-top: 0;
}

.history-list > article:hover,
.history-list > article.is-selected {
  background: #edf7f4;
}

.history-select {
  min-width: 0;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.history-version,
.history-time {
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
}

.history-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.history-copy strong {
  color: var(--ink);
  font-size: 12px;
}

.history-copy small {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-mark {
  color: var(--teal);
}

.advanced-library {
  min-width: 0;
}

.advanced-library summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  border: 1px dashed var(--line);
  border-radius: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}

.advanced-library summary:hover,
.advanced-library summary:focus-visible {
  border-color: rgba(20, 123, 115, 0.4);
  color: var(--teal-dark);
  outline: none;
}

.advanced-library[open] summary {
  margin-bottom: 10px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 38px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  color: var(--muted);
  font-size: 13px;
}

.resume-editor {
  display: grid;
  gap: 13px;
}

.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
}

.resume-editor label {
  min-width: 0;
  display: grid;
  gap: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}

.resume-editor input,
.resume-editor select,
.resume-editor textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
}

.resume-editor input,
.resume-editor select {
  min-height: 38px;
  padding: 0 10px;
}

.resume-editor textarea {
  min-height: 420px;
  padding: 11px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.65;
  resize: vertical;
}

.resume-editor input:focus-visible,
.resume-editor select:focus-visible,
.resume-editor textarea:focus-visible {
  border-color: rgba(20, 123, 115, 0.52);
  outline: 2px solid rgba(20, 123, 115, 0.16);
  outline-offset: 1px;
}

@media (max-width: 1080px) {
  .resume-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .resume-toolbar,
  .next-step {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-actions,
  .next-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .next-step p {
    white-space: normal;
  }
}

@media (max-width: 560px) {
  .editor-grid,
  .history-list > article,
  .history-select {
    grid-template-columns: minmax(0, 1fr);
  }

  .history-list > article {
    align-items: start;
  }

  .resume-preview > :deep(.agent-markdown) {
    padding: 18px 15px;
  }
}
</style>
