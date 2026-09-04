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
  Send,
  ShieldAlert,
  Sparkles
} from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { storeToRefs } from "pinia";

import AgentMarkdown from "@/components/agent/AgentMarkdown.vue";
import LocalResumeLibraryBridge from "@/components/resume/LocalResumeLibraryBridge.vue";
import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDrawer from "@/components/ui/WorkbenchDrawer.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import type {
  EvidenceAbility,
  ResumeDocument,
  ResumeDocumentSource,
  ResumeVersion,
  ResumeVersionStatus
} from "@/stores/studentWorkbench";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";
import { documentInputFromText } from "@/utils/resumeImport";
import { buildResumeSelectionSuggestion } from "@/utils/resumeSelectionSkill";

const store = useStudentWorkbenchStore();
const { evidenceAbilities, resumeDocuments, resumeTemplates } = storeToRefs(store);

const importInput = ref<HTMLInputElement | null>(null);
const importError = ref("");
const MAX_RESUME_IMPORT_BYTES = 2 * 1024 * 1024;
const editorError = ref("");
const editorOpen = ref(false);
const editorMode = ref<"create" | "edit">("edit");
const editorDraftId = ref<number | null>(null);
const historyOpen = ref(false);
const initialDocument = resumeDocuments.value[0] ?? null;
const selectedDocumentId = ref<number | null>(initialDocument?.id ?? null);
const previewVersionId = ref<number | null>(applicationVersion(initialDocument)?.id ?? null);
const editorTextarea = ref<HTMLTextAreaElement | null>(null);
const skillIntentInput = ref<HTMLInputElement | null>(null);

const form = reactive({
  title: "",
  targetRole: "",
  templateId: "classic-ats",
  changeNote: "初稿",
  content: ""
});

const selectionRange = reactive({ start: 0, end: 0 });
const contextMenu = reactive({ open: false, x: 0, y: 0 });
const rightDragSelection = reactive({
  active: false,
  anchor: 0,
  points: [] as Array<{ offset: number; x: number; y: number }>
});
const selectionSkill = reactive({
  status: "idle" as "idle" | "blocked" | "suggested",
  message: "",
  suggestion: "",
  evidence: [] as EvidenceAbility[],
  gaps: [] as string[]
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

const sourceLabel: Record<ResumeDocumentSource, string> = {
  agent: "Agent 修改",
  import: "导入修改",
  manual: "手工修改"
};

const selectedDocument = computed(
  () => resumeDocuments.value.find(item => item.id === selectedDocumentId.value) ?? resumeDocuments.value[0] ?? null
);

const currentVersion = computed(() => applicationVersion(selectedDocument.value));

const selectedDraft = computed(() => documentDraft(selectedDocument.value));

const selectedVersion = computed(() => {
  const document = selectedDocument.value;
  if (!document) return null;
  return (
    document.versions.find(item => item.id === previewVersionId.value) ??
    currentVersion.value ??
    selectedDraft.value ??
    null
  );
});

const selectedText = computed(() => form.content.slice(selectionRange.start, selectionRange.end));

const objectStatus = computed(() => {
  if (selectedDraft.value) return "有待处理修改";
  if (currentVersion.value?.status === "exported") return "已投出";
  if (currentVersion.value) return "可投递";
  return "待定稿";
});

const objectNextAction = computed(() => {
  if (selectedDraft.value) return `处理 v${selectedDraft.value.version} 修改`;
  if (!currentVersion.value) return "完成并定稿第一版";
  return `从 v${currentVersion.value.version} 派生修改`;
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

function applicationVersion(document: ResumeDocument | null) {
  if (!document) return null;
  const version = document.versions.find(item => item.id === document.activeVersionId);
  return version && version.status !== "draft" ? version : null;
}

function documentDraft(document: ResumeDocument | null) {
  return document?.versions.find(item => item.status === "draft") ?? null;
}

function selectDocument(document: ResumeDocument) {
  selectedDocumentId.value = document.id;
  previewVersionId.value = applicationVersion(document)?.id ?? documentDraft(document)?.id ?? null;
  historyOpen.value = false;
}

function selectVersion(version: ResumeVersion) {
  previewVersionId.value = version.id;
}

function selectCurrentPreview() {
  if (currentVersion.value) previewVersionId.value = currentVersion.value.id;
}

function selectDraftPreview() {
  if (selectedDraft.value) previewVersionId.value = selectedDraft.value.id;
}

function sortedVersions(document: ResumeDocument) {
  return [...document.versions].sort((left, right) => right.version - left.version);
}

function templateName(templateId: string) {
  return resumeTemplates.value.find(template => template.id === templateId)?.nameZh ?? "经典 ATS";
}

function statusTone(status: ResumeVersionStatus) {
  if (status === "exported") return "success" as const;
  if (status === "final") return "accent" as const;
  return "warning" as const;
}

function resetSelectionSkill() {
  selectionSkill.status = "idle";
  selectionSkill.message = "";
  selectionSkill.suggestion = "";
  selectionSkill.evidence = [];
  selectionSkill.gaps = [];
}

function openDraft(document: ResumeDocument, draft: ResumeVersion) {
  editorError.value = "";
  selectedDocumentId.value = document.id;
  previewVersionId.value = draft.id;
  editorDraftId.value = draft.id;
  Object.assign(form, {
    title: document.title,
    targetRole: document.targetRole,
    templateId: draft.templateId,
    changeNote: draft.changeNote,
    content: draft.content
  });
  selectionRange.start = 0;
  selectionRange.end = 0;
  resetSelectionSkill();
  editorMode.value = "edit";
  editorOpen.value = true;
}

function startCreating() {
  editorError.value = "";
  editorMode.value = "create";
  editorDraftId.value = null;
  Object.assign(form, {
    title: "我的新简历",
    targetRole: "未标注岗位",
    templateId: resumeTemplates.value[0]?.id ?? "classic-ats",
    changeNote: "初稿",
    content: BLANK_RESUME_TEMPLATE
  });
  selectionRange.start = 0;
  selectionRange.end = 0;
  resetSelectionSkill();
  editorOpen.value = true;
}

function startEditing() {
  const document = selectedDocument.value;
  if (!document) return;
  const draft = documentDraft(document);
  if (draft) {
    openDraft(document, draft);
    return;
  }

  const base = applicationVersion(document);
  if (!base) return;
  try {
    const created = store.createResumeDraft(document.id, base.id, {
      title: document.title,
      targetRole: document.targetRole,
      templateId: base.templateId,
      content: base.content,
      source: "manual",
      changeNote: `从 v${base.version} 继续`
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
      previewVersionId.value = created.versions[0]?.id ?? null;
      editorOpen.value = false;
    } catch (error) {
      editorError.value = error instanceof Error ? error.message : "简历创建失败";
    }
    return;
  }

  const document = selectedDocument.value;
  const draftId = editorDraftId.value;
  if (!document || !draftId) return;
  const draft = document.versions.find(item => item.id === draftId && item.status === "draft");
  if (!draft) {
    editorError.value = "只能保存草稿，定稿版本保持只读";
    return;
  }

  try {
    store.updateResumeDraft(document.id, draft.id, { ...form });
    previewVersionId.value = draft.id;
    editorOpen.value = false;
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : "简历保存失败";
  }
}

function confirmDraft() {
  const document = selectedDocument.value;
  const draft = selectedDraft.value;
  if (!document || !draft) return;
  store.finalizeResumeVersion(document.id, draft.id);
  previewVersionId.value = draft.id;
}

function markExported() {
  const document = selectedDocument.value;
  const version = currentVersion.value;
  if (!document || !version || version.status !== "final") return;
  store.markResumeVersionExported(document.id, version.id);
}

function setCurrentVersion(version: ResumeVersion) {
  const document = selectedDocument.value;
  if (!document || version.status === "draft") return;
  store.setActiveResumeVersion(document.id, version.id);
  previewVersionId.value = version.id;
}

function updateSelection() {
  const textarea = editorTextarea.value;
  if (!textarea) return;
  selectionRange.start = textarea.selectionStart;
  selectionRange.end = textarea.selectionEnd;
  if (selectionRange.start === selectionRange.end) contextMenu.open = false;
}

function buildTextareaPointMap(textarea: HTMLTextAreaElement) {
  const rect = textarea.getBoundingClientRect();
  const sourceStyle = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const styleProperties = [
    "font",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "fontVariant",
    "letterSpacing",
    "lineHeight",
    "textIndent",
    "textTransform",
    "whiteSpace",
    "wordSpacing",
    "wordBreak",
    "overflowWrap",
    "tabSize",
    "textAlign",
    "direction",
    "padding",
    "border",
    "boxSizing"
  ] as const;

  for (const property of styleProperties) {
    const cssName = property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
    const value = sourceStyle.getPropertyValue(cssName);
    if (value) mirror.style[property] = value;
  }
  mirror.style.position = "fixed";
  mirror.style.left = `${rect.left - textarea.scrollLeft}px`;
  mirror.style.top = `${rect.top - textarea.scrollTop}px`;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = "auto";
  mirror.style.overflow = "hidden";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.textContent = textarea.value;
  document.body.appendChild(mirror);

  const textNode = mirror.firstChild;
  const range = document.createRange();
  const points: Array<{ offset: number; x: number; y: number }> = [];
  if (textNode) {
    const textLength = textNode.textContent?.length ?? 0;
    for (let offset = 0; offset < textLength; offset += 1) {
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + 1);
      const characterRect = range.getBoundingClientRect();
      if (characterRect.width || characterRect.height) {
        points.push({
          offset,
          x: characterRect.left + characterRect.width / 2,
          y: characterRect.top + characterRect.height / 2
        });
      }
    }
  }

  mirror.remove();
  return points;
}

function offsetFromPoint(clientX: number, clientY: number) {
  if (!rightDragSelection.points.length) return 0;
  return rightDragSelection.points.reduce((best, point) => {
    const bestDistance = Math.abs(best.y - clientY) * 4 + Math.abs(best.x - clientX);
    const pointDistance = Math.abs(point.y - clientY) * 4 + Math.abs(point.x - clientX);
    return pointDistance < bestDistance ? point : best;
  }).offset;
}

function beginRightDragSelection(event: PointerEvent) {
  if (event.button !== 2) return;
  const textarea = editorTextarea.value;
  if (!textarea) return;

  event.preventDefault();
  textarea.focus();
  textarea.setPointerCapture(event.pointerId);
  rightDragSelection.points = buildTextareaPointMap(textarea);
  rightDragSelection.anchor = offsetFromPoint(event.clientX, event.clientY);
  rightDragSelection.active = true;
  textarea.setSelectionRange(rightDragSelection.anchor, rightDragSelection.anchor);
  updateSelection();
}

function moveRightDragSelection(event: PointerEvent) {
  if (!rightDragSelection.active) return;
  const textarea = editorTextarea.value;
  if (!textarea) return;

  event.preventDefault();
  const offset = offsetFromPoint(event.clientX, event.clientY);
  const start = Math.min(rightDragSelection.anchor, offset);
  const end = Math.max(rightDragSelection.anchor, offset);
  textarea.setSelectionRange(start, end, offset < rightDragSelection.anchor ? "backward" : "forward");
  updateSelection();
}

function endRightDragSelection(event: PointerEvent) {
  if (!rightDragSelection.active) return;
  const textarea = editorTextarea.value;
  event.preventDefault();
  if (textarea) moveRightDragSelection(event);
  if (textarea?.hasPointerCapture(event.pointerId)) {
    textarea.releasePointerCapture(event.pointerId);
  }
  rightDragSelection.active = false;
  rightDragSelection.points = [];
  if (selectionRange.start === selectionRange.end) {
    contextMenu.open = false;
    return;
  }

  const menuWidth = 252;
  const menuHeight = 88;
  contextMenu.x = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
  contextMenu.y = Math.min(event.clientY, window.innerHeight - menuHeight - 12);
  contextMenu.open = true;
}

function cancelRightDragSelection(event: PointerEvent) {
  const textarea = editorTextarea.value;
  if (textarea?.hasPointerCapture(event.pointerId)) {
    textarea.releasePointerCapture(event.pointerId);
  }
  rightDragSelection.active = false;
  rightDragSelection.points = [];
}

function handleEditorInput() {
  updateSelection();
  resetSelectionSkill();
}

function handleContextMenu(event: MouseEvent) {
  if (rightDragSelection.active) {
    event.preventDefault();
    return;
  }
  updateSelection();
  if (!selectedText.value.trim()) {
    contextMenu.open = false;
    return;
  }

  event.preventDefault();
  const menuWidth = 252;
  const menuHeight = 88;
  contextMenu.x = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
  contextMenu.y = Math.min(event.clientY, window.innerHeight - menuHeight - 12);
  contextMenu.open = true;
}

async function openSelectionSkill() {
  contextMenu.open = false;
  editorError.value = "";
  resetSelectionSkill();
  await nextTick();
  skillIntentInput.value?.scrollIntoView({ block: "nearest" });
  skillIntentInput.value?.focus();
}

function generateSelectionSuggestion() {
  const result = buildResumeSelectionSuggestion({
    selectedText: selectedText.value,
    resumeContent: form.content,
    intent: selectionIntentValue(),
    abilities: evidenceAbilities.value
  });
  selectionSkill.status = result.status;
  selectionSkill.message = result.message;
  selectionSkill.suggestion = result.suggestion;
  selectionSkill.evidence = result.evidence;
  selectionSkill.gaps = result.gaps;
  store.addTrace(
    "选区兜底 skill 生成",
    selectedDocument.value?.title ?? form.title,
    result.status === "blocked"
      ? `已阻断：${result.message}`
      : `已生成保守替换稿，匹配证据 ${result.evidence.length} 条；未写入简历版本`
  );
}

function selectionIntentValue() {
  return skillIntentInput.value?.value.trim() ?? "";
}

function applySelectionSuggestion() {
  const replacement = selectionSkill.suggestion.trim();
  if (!replacement) return;
  if (form.content.slice(selectionRange.start, selectionRange.end) !== selectedText.value) {
    resetSelectionSkill();
    editorError.value = "选区已变化，请重新选中后再替换";
    return;
  }

  form.content = `${form.content.slice(0, selectionRange.start)}${replacement}${form.content.slice(selectionRange.end)}`;
  store.addTrace(
    "选区兜底 skill 替换",
    selectedDocument.value?.title ?? form.title,
    "仅替换编辑缓冲区中的选中片段；保存前不写入简历版本"
  );
  selectionRange.start = 0;
  selectionRange.end = 0;
  resetSelectionSkill();
}

function handleOutsideEvent(event: Event) {
  if (!contextMenu.open) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest(".selection-menu")) return;
  contextMenu.open = false;
}

onMounted(() => {
  document.addEventListener("mousedown", handleOutsideEvent);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleOutsideEvent);
});
</script>

<template>
  <StudentWorkbenchModule
    eyebrow="Resume Manager"
    title="简历管理"
    description="一份简历是一个对象；手工和 Agent 修改都进入同一份待处理草稿。"
    agent-action="回 Agent 生成"
    status="本机会话"
  >
    <div class="resume-toolbar">
      <div>
        <strong>简历对象</strong>
        <span>{{ resumeDocuments.length }} 份 · 平铺管理</span>
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
          导入成品
        </WorkbenchButton>
        <WorkbenchButton variant="primary" @click="startCreating">
          <FilePlus2 :size="15" />
          新建简历
        </WorkbenchButton>
      </div>
    </div>

    <p v-if="importError" class="state-error" role="alert">{{ importError }}</p>

    <div v-if="selectedDocument && selectedVersion" class="resume-layout">
      <aside class="resume-list" aria-label="简历对象列表">
        <button
          v-for="document in resumeDocuments"
          :key="document.id"
          type="button"
          :class="{ 'is-selected': document.id === selectedDocument.id }"
          @click="selectDocument(document)"
        >
          <span class="resume-title">
            <strong>{{ document.title }}</strong>
            <CircleCheck v-if="applicationVersion(document)" :size="15" aria-label="已有投递版" />
          </span>
          <small>{{ document.targetRole }}</small>
          <span class="resume-state">
            {{ applicationVersion(document) ? `投递 v${applicationVersion(document)?.version} · ${statusLabel[applicationVersion(document)!.status]}` : "待定稿" }}
          </span>
          <span v-if="documentDraft(document)" class="draft-pill">
            待处理 v{{ documentDraft(document)?.version }} · {{ sourceLabel[documentDraft(document)!.source] }}
          </span>
        </button>

        <button type="button" class="create-inline" @click="startCreating">
          <FilePlus2 :size="15" />
          新建一份
        </button>
      </aside>

      <main class="resume-workspace">
        <header class="resume-heading">
          <div>
            <div class="heading-meta">
              <WorkbenchStatus :tone="selectedDraft ? 'warning' : currentVersion ? statusTone(currentVersion.status) : 'warning'">
                {{ objectStatus }}
              </WorkbenchStatus>
              <span>{{ selectedDocument.targetRole }}</span>
            </div>
            <h3>{{ selectedDocument.title }}</h3>
            <p>{{ objectNextAction }} · 历史 {{ selectedDocument.versions.length }} 版</p>
          </div>
          <div class="heading-actions">
            <WorkbenchButton variant="primary" @click="startEditing">
              <FilePenLine :size="15" />
              {{ selectedDraft ? "处理修改" : "派生草稿" }}
            </WorkbenchButton>
            <WorkbenchButton variant="secondary" @click="historyOpen = true">
              <History :size="15" />
              历史
            </WorkbenchButton>
          </div>
        </header>

        <div class="object-grid">
          <section class="version-card" aria-label="当前投递版">
            <header>
              <span>当前投递版</span>
              <WorkbenchStatus v-if="currentVersion" :tone="statusTone(currentVersion.status)">
                v{{ currentVersion.version }} · {{ statusLabel[currentVersion.status] }}
              </WorkbenchStatus>
              <WorkbenchStatus v-else tone="warning">待定稿</WorkbenchStatus>
            </header>
            <template v-if="currentVersion">
              <p>{{ currentVersion.changeNote }}</p>
              <dl>
                <div><dt>来源</dt><dd>{{ sourceLabel[currentVersion.source] }}</dd></div>
                <div><dt>模板</dt><dd>{{ templateName(currentVersion.templateId) }}</dd></div>
                <div><dt>更新</dt><dd>{{ currentVersion.updatedAt }}</dd></div>
              </dl>
              <WorkbenchButton
                v-if="currentVersion.status === 'final'"
                size="sm"
                @click="markExported"
              >
                <Send :size="14" />
                标记已投出
              </WorkbenchButton>
            </template>
            <p v-else class="empty-copy">这份简历还没有可投递版本；先完成草稿并确认定稿。</p>
          </section>

          <section class="version-card draft-card" :class="{ 'is-empty': !selectedDraft }" aria-label="待处理修改">
            <header>
              <span>待处理修改</span>
              <WorkbenchStatus v-if="selectedDraft" tone="warning">
                v{{ selectedDraft.version }} 草稿
              </WorkbenchStatus>
              <WorkbenchStatus v-else>无</WorkbenchStatus>
            </header>
            <template v-if="selectedDraft">
              <p>{{ selectedDraft.changeNote }}</p>
              <dl>
                <div><dt>来源</dt><dd>{{ sourceLabel[selectedDraft.source] }}</dd></div>
                <div><dt>模板</dt><dd>{{ templateName(selectedDraft.templateId) }}</dd></div>
                <div><dt>更新</dt><dd>{{ selectedDraft.updatedAt }}</dd></div>
              </dl>
              <div class="card-actions">
                <WorkbenchButton size="sm" @click="startEditing">
                  <FilePenLine :size="14" />
                  打开编辑
                </WorkbenchButton>
                <WorkbenchButton size="sm" variant="primary" @click="confirmDraft">
                  <CircleCheck :size="14" />
                  确认定稿
                </WorkbenchButton>
              </div>
            </template>
            <p v-else class="empty-copy">从当前投递版派生草稿；保存草稿不会改变投递版。</p>
          </section>
        </div>

        <section class="resume-preview" aria-label="简历预览">
          <header>
            <div class="preview-tabs" role="tablist" aria-label="预览版本">
              <button
                type="button"
                :disabled="!currentVersion"
                :class="{ 'is-active': selectedVersion.id === currentVersion?.id }"
                @click="selectCurrentPreview"
              >
                当前投递版
              </button>
              <button
                v-if="selectedDraft"
                type="button"
                :class="{ 'is-active': selectedVersion.id === selectedDraft.id }"
                @click="selectDraftPreview"
              >
                待处理草稿
              </button>
              <button
                v-if="selectedVersion.id !== currentVersion?.id && selectedVersion.id !== selectedDraft?.id"
                type="button"
                class="is-active"
              >
                历史 v{{ selectedVersion.version }}
              </button>
            </div>
            <span>{{ selectedVersion.fileName ?? templateName(selectedVersion.templateId) }}</span>
          </header>
          <AgentMarkdown :content="selectedVersion.content" />
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
      :description="editorMode === 'create' ? '先建立一份可编辑草稿。' : '保存只写入这份简历的唯一草稿。'"
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
          <textarea
            ref="editorTextarea"
            v-model="form.content"
            rows="20"
            spellcheck="false"
            @pointerdown="beginRightDragSelection"
            @pointermove="moveRightDragSelection"
            @pointerup="endRightDragSelection"
            @pointercancel="cancelRightDragSelection"
            @select="updateSelection"
            @keyup="updateSelection"
            @mouseup="updateSelection"
            @input="handleEditorInput"
            @contextmenu="handleContextMenu"
          ></textarea>
        </label>

        <section class="selection-skill" aria-label="选中片段兜底 skill">
          <header>
            <div>
              <strong>选中片段兜底 skill</strong>
              <p>上下文：本简历全文 + 能力资产 {{ evidenceAbilities.length }} 条</p>
            </div>
            <WorkbenchStatus tone="neutral">规则兜底</WorkbenchStatus>
          </header>

          <div class="selection-summary">
            <span v-if="selectedText.trim()">已选 {{ selectedText.trim().length }} 字</span>
            <span v-else>未选中文本</span>
            <span>替换只改编辑缓冲区</span>
          </div>

          <label>
            修改意图
            <input ref="skillIntentInput" type="text" maxlength="120" placeholder="例如：更像 Java 后端校招表达">
          </label>

          <div class="skill-actions">
            <WorkbenchButton size="sm" :disabled="!selectedText.trim()" @click="generateSelectionSuggestion">
              <Sparkles :size="14" />
              生成安全替换
            </WorkbenchButton>
            <WorkbenchButton size="sm" variant="secondary" @click="openSelectionSkill">
              重新选区
            </WorkbenchButton>
          </div>

          <p v-if="selectionSkill.message" class="skill-message" :class="`is-${selectionSkill.status}`" role="status">
            {{ selectionSkill.message }}
          </p>

          <template v-if="selectionSkill.status === 'blocked'">
            <div class="skill-warning">
              <ShieldAlert :size="15" />
              <span>不会补写事实、数字或经历；请先补充能力资产或缩小选区。</span>
            </div>
          </template>

          <template v-else-if="selectionSkill.status === 'suggested'">
            <label>
              可编辑替换稿
              <textarea v-model="selectionSkill.suggestion" rows="4"></textarea>
            </label>
            <div v-if="selectionSkill.evidence.length" class="evidence-list">
              <article v-for="ability in selectionSkill.evidence" :key="ability.id">
                <strong>{{ ability.name }}</strong>
                <span>{{ ability.evidence }}</span>
              </article>
            </div>
            <ul v-if="selectionSkill.gaps.length" class="gap-list">
              <li v-for="gap in selectionSkill.gaps" :key="gap">{{ gap }}</li>
            </ul>
            <WorkbenchButton size="sm" variant="primary" @click="applySelectionSuggestion">
              替换选中片段
            </WorkbenchButton>
          </template>
        </section>

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

    <Teleport to="body">
      <div
        v-if="contextMenu.open"
        class="selection-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        role="menu"
      >
        <button type="button" @click="openSelectionSkill">
          <Sparkles :size="15" />
          Agent 改写选中片段
        </button>
        <span>上下文：本简历 + 能力资产</span>
      </div>
    </Teleport>

    <WorkbenchDrawer v-model:open="historyOpen" title="历史版本" :description="`${selectedDocument?.title ?? ''} 的版本记录`">
      <div v-if="selectedDocument" class="history-list">
        <article
          v-for="version in sortedVersions(selectedDocument)"
          :key="version.id"
          :class="{ 'is-selected': version.id === selectedVersion?.id }"
        >
          <button type="button" class="history-select" @click="selectVersion(version)">
            <span class="history-version">v{{ version.version }}</span>
            <span class="history-copy">
              <strong>{{ statusLabel[version.status] }}</strong>
              <small>{{ version.changeNote }}</small>
            </span>
            <span class="history-time">{{ version.updatedAt }}</span>
          </button>
          <div class="history-actions">
            <CircleCheck
              v-if="version.id === currentVersion?.id"
              class="current-mark"
              :size="15"
              aria-label="当前投递版"
            />
            <WorkbenchButton
              v-else-if="version.status !== 'draft'"
              size="sm"
              @click="setCurrentVersion(version)"
            >
              设为当前
            </WorkbenchButton>
          </div>
        </article>
      </div>
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
.version-card,
.resume-preview {
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
  gap: 9px;
  padding: 12px;
}

.resume-list > button {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: 6px;
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

.resume-list small,
.resume-state {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-pill {
  justify-self: start;
  max-width: 100%;
  overflow: hidden;
  padding: 3px 6px;
  border-radius: 5px;
  background: rgba(238, 166, 71, 0.16);
  color: #916018;
  font-size: 10.5px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
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
  margin: 9px 0 0;
  color: var(--ink);
  font-size: 21px;
  line-height: 1.3;
}

.resume-heading p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.heading-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.object-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
}

.version-card {
  min-width: 0;
  display: grid;
  gap: 11px;
  align-content: start;
  padding: 13px 14px;
}

.draft-card {
  border-color: rgba(238, 166, 71, 0.28);
}

.draft-card.is-empty {
  border-color: var(--line);
}

.version-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.version-card > header > span:first-child {
  color: var(--ink);
  font-size: 13px;
  font-weight: 900;
}

.version-card > p,
.version-card dd {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.version-card dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.version-card dl > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.version-card dt {
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
}

.version-card dd {
  overflow: hidden;
  color: var(--ink);
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-copy {
  padding: 4px 0 2px;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
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
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  background: #fbfdfd;
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
}

.preview-tabs {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
}

.preview-tabs button {
  min-height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.preview-tabs button:disabled {
  cursor: not-allowed;
  opacity: 45%;
}

.preview-tabs button.is-active {
  background: #edf7f4;
  color: var(--teal-dark);
}

.resume-preview > header > span:last-child {
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

.selection-skill {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
}

.selection-skill > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.selection-skill > header > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.selection-skill strong {
  color: var(--ink);
  font-size: 13px;
}

.selection-skill p {
  margin: 0;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.selection-summary,
.skill-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.selection-summary span {
  padding: 4px 7px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: #fff;
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
}

.skill-message {
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.5;
}

.skill-message.is-suggested {
  border: 1px solid rgba(20, 123, 115, 0.2);
  background: #edf7f4;
  color: var(--teal-dark);
}

.skill-message.is-blocked {
  border: 1px solid rgba(199, 144, 37, 0.24);
  background: #fbf3e2;
  color: #7d5a12;
}

.skill-warning {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #7d5a12;
  font-size: 11.5px;
  line-height: 1.45;
}

.selection-skill > label {
  min-width: 0;
  display: grid;
  gap: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}

.selection-skill input,
.selection-skill textarea {
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 12.5px;
}

.selection-skill textarea {
  min-height: 96px;
  padding: 9px 10px;
  line-height: 1.6;
  resize: vertical;
}

.selection-skill input:focus-visible,
.selection-skill textarea:focus-visible {
  border-color: rgba(20, 123, 115, 0.52);
  outline: 2px solid rgba(20, 123, 115, 0.16);
  outline-offset: 1px;
}

.evidence-list {
  display: grid;
  gap: 7px;
}

.evidence-list article {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
}

.evidence-list strong {
  color: var(--ink);
  font-size: 12px;
}

.evidence-list span {
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.gap-list {
  margin: 0;
  padding-left: 17px;
  color: #7d5a12;
  font-size: 11.5px;
  line-height: 1.5;
}

.selection-menu {
  position: fixed;
  z-index: 120;
  width: 252px;
  display: grid;
  gap: 5px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 14px 38px rgba(23, 33, 36, 0.16);
}

.selection-menu button {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  font-weight: 850;
  text-align: left;
  cursor: pointer;
}

.selection-menu button:hover,
.selection-menu button:focus-visible {
  background: #edf7f4;
  color: var(--teal-dark);
  outline: none;
}

.selection-menu span {
  padding: 0 4px 2px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.35;
}

.history-list {
  display: grid;
  gap: 8px;
}

.history-list > article {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: inherit;
}

.history-list > article.is-selected {
  border-color: rgba(20, 123, 115, 0.36);
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

.history-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.current-mark {
  color: var(--teal);
}

@media (max-width: 1080px) {
  .resume-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .resume-toolbar,
  .resume-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-actions,
  .heading-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .object-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .version-card dl {
    grid-template-columns: minmax(0, 1fr);
  }

  .resume-preview > header {
    align-items: stretch;
    flex-direction: column;
  }

  .preview-tabs {
    overflow-x: auto;
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

  .history-actions {
    justify-content: flex-start;
  }

  .resume-preview > :deep(.agent-markdown) {
    padding: 18px 15px;
  }
}
</style>
