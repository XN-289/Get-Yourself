<script setup lang="ts">
import { CircleCheck, FilePenLine, FileText, FileUp, GitBranch, Save, Send } from "@lucide/vue";
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDrawer from "@/components/ui/WorkbenchDrawer.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import type {
  ResumeDocument,
  ResumeDocumentInput,
  ResumeVersion,
  ResumeVersionStatus
} from "@/stores/studentWorkbench";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";

type UnknownRecord = Record<string, unknown>;

const store = useStudentWorkbenchStore();
const { resumeDocuments, resumeStatusCount, resumeTemplates } = storeToRefs(store);

const importInput = ref<HTMLInputElement | null>(null);
const importError = ref("");
const editorError = ref("");
const editorOpen = ref(false);
const initialDocument = resumeDocuments.value[0] ?? null;
const initialVersion =
  initialDocument?.versions.find((item) => item.status === "draft") ??
  initialDocument?.versions.find((item) => item.id === initialDocument.activeVersionId) ??
  null;
const selectedDocumentId = ref<number | null>(initialDocument?.id ?? null);
const selectedVersionId = ref<number | null>(initialVersion?.id ?? null);
const form = reactive({
  title: "",
  targetRole: "",
  templateId: "classic-ats",
  changeNote: "",
  content: ""
});

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
  if (!document) return null;
  return document.versions.find((item) => item.status === "draft") ?? null;
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

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asBullets(value: unknown) {
  return asArray(value)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = asRecord(item);
      return asString(record?.bullet ?? record?.description ?? record?.detail);
    })
    .filter(Boolean);
}

function pushSection(lines: string[], title: string, rows: string[]) {
  if (rows.length === 0) return;
  lines.push("", `## ${title}`);
  for (const row of rows) {
    if (row.startsWith("### ") || row.startsWith("- ")) lines.push(row);
    else lines.push(`- ${row}`);
  }
}

function joinParts(parts: string[], separator = " · ") {
  return parts.filter(Boolean).join(separator);
}

function formatPeriod(start: unknown, end: unknown) {
  return joinParts([asString(start), asString(end)], " - ");
}

function renderPackageToInput(text: string, fileName: string): ResumeDocumentInput {
  const parsed: unknown = JSON.parse(text);
  const root = asRecord(parsed);
  if (!root || asString(root.schema) !== "get-yourself.resume-render" || root.schemaVersion !== 1) {
    throw new Error("只支持 get-yourself.resume-render v1 JSON");
  }
  if (root.confirmation !== "user_confirmed") {
    throw new Error("渲染包尚未经过用户确认");
  }

  const resume = asRecord(root.resume);
  if (!resume) throw new Error("渲染包缺少 resume 字段");
  const header = asRecord(resume.header);
  const name = asString(header?.name, "未命名学生");
  const headline = asString(header?.headline, "未标注岗位");
  const lines = [`# ${name} · ${headline}`];
  const contact = joinParts([asString(header?.location), asString(header?.email), asString(header?.phone)], " / ");
  if (contact) lines.push("", contact);
  const linkRows = asArray(header?.links)
    .map((item) => {
      const record = asRecord(item);
      const label = asString(record?.name, "链接");
      const url = asString(record?.url);
      return url ? `${label}：${url}` : "";
    })
    .filter(Boolean);
  pushSection(lines, "链接", linkRows);
  const summary = asString(resume.summary);
  if (summary) lines.push("", "## 摘要", summary);

  const experienceRows = asArray(resume.experience).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const company = asString(record.company, "未命名组织");
    const role = asString(record.role, "成员");
    const meta = joinParts([formatPeriod(record.start, record.end), asString(record.location)]);
    return [`### ${joinParts([company, role])}${meta ? ` · ${meta}` : ""}`, ...asBullets(record.bullets)];
  });
  pushSection(lines, "实习与工作", experienceRows);

  const projectRows = asArray(resume.projects).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const title = asString(record.name, "未命名项目");
    const role = asString(record.role);
    const meta = joinParts([asString(record.date), asString(record.link)]);
    return [`### ${joinParts([title, role])}${meta ? ` · ${meta}` : ""}`, ...asBullets(record.bullets)];
  });
  pushSection(lines, "项目经历", projectRows);

  const educationRows = asArray(resume.education).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const heading = joinParts([
      asString(record.school, "未命名学校"),
      asString(record.degree),
      formatPeriod(record.start, record.end),
      asString(record.location)
    ]);
    const detail = asString(record.detail);
    return [`### ${heading}`, ...(detail ? [`- ${detail}`] : [])];
  });
  pushSection(lines, "教育经历", educationRows);

  const skillRows = asArray(resume.skills)
    .map((item) => {
      const record = asRecord(item);
      const group = asString(record?.group, "技能");
      const items = asBullets(record?.items).join(" / ");
      return items ? `${group}：${items}` : "";
    })
    .filter(Boolean);
  pushSection(lines, "技能", skillRows);

  const certificationRows = asArray(resume.certifications)
    .map((item) => {
      const record = asRecord(item);
      return joinParts([asString(record?.name), asString(record?.issuer), asString(record?.date)]);
    })
    .filter(Boolean);
  pushSection(lines, "证书", certificationRows);

  const awardRows = asArray(resume.awards)
    .map((item) => {
      const record = asRecord(item);
      return joinParts([asString(record?.title), asString(record?.date), asString(record?.note)]);
    })
    .filter(Boolean);
  pushSection(lines, "奖项", awardRows);

  const languageRows = asArray(resume.languages)
    .map((item) => {
      const record = asRecord(item);
      return joinParts([asString(record?.language, "语言"), asString(record?.level)]);
    })
    .filter(Boolean);
  pushSection(lines, "语言", languageRows);

  const publicationRows = asArray(resume.publications)
    .map((item) => {
      const record = asRecord(item);
      return joinParts([asString(record?.title), asString(record?.venue), asString(record?.date)]);
    })
    .filter(Boolean);
  pushSection(lines, "发表", publicationRows);

  const volunteerRows = asArray(resume.volunteer).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const heading = joinParts([
      asString(record.organization, "志愿经历"),
      asString(record.role),
      formatPeriod(record.start, record.end)
    ]);
    return [`### ${heading}`, ...asBullets(record.bullets)];
  });
  pushSection(lines, "志愿经历", volunteerRows);

  return {
    title: `${name} · ${headline}`,
    targetRole: headline,
    templateId: asString(root.templateId, "classic-ats"),
    content: lines.join("\n"),
    source: "import",
    fileName
  };
}

function documentInputFromText(text: string, fileName: string): ResumeDocumentInput {
  if (fileName.toLowerCase().endsWith(".json")) return renderPackageToInput(text, fileName);
  return {
    title: fileName.replace(/\.[^.]+$/, "") || "导入简历",
    targetRole: "未标注岗位",
    templateId: "classic-ats",
    content: text,
    source: "import",
    changeNote: "本机成品导入",
    fileName
  };
}

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  importError.value = "";
  if (!file) return;

  try {
    const imported = store.importResumeDocument(documentInputFromText(await file.text(), file.name));
    selectedDocumentId.value = imported.id;
    selectedVersionId.value = imported.activeVersionId;
  } catch (error) {
    importError.value = error instanceof Error ? error.message : "简历导入失败";
  } finally {
    input.value = "";
  }
}

function selectDocument(document: ResumeDocument) {
  selectedDocumentId.value = document.id;
  selectedVersionId.value = document.activeVersionId;
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
  editorOpen.value = true;
}

function startEditing() {
  const document = selectedDocument.value;
  const version = selectedVersion.value;
  if (!document || !version) return;
  try {
    if (version.status === "draft") {
      openDraft(document, version);
      return;
    }
    const draft = store.createResumeDraft(document.id, version.id, {
      title: document.title,
      targetRole: document.targetRole,
      templateId: version.templateId,
      content: version.content,
      source: "manual",
      changeNote: `从 v${version.version} 继续`
    });
    openDraft(document, draft);
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : "无法创建草稿";
  }
}

function saveEditor() {
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
    description="按岗位方向管理简历版本线，定稿版本只读，修改必须派生新草稿。"
    agent-action="回 Agent 生成"
    status="本地读取 · 不上传"
  >
    <div class="resume-summary">
      <div>
        <span>简历线</span>
        <strong>{{ resumeDocuments.length }}</strong>
        <small>岗位方向下的持续版本</small>
      </div>
      <div>
        <span>草稿</span>
        <strong>{{ resumeStatusCount.draft }}</strong>
        <small>待用户确认</small>
      </div>
      <div>
        <span>定稿版</span>
        <strong>{{ resumeStatusCount.final }}</strong>
        <small>可设为投递版</small>
      </div>
      <div>
        <span>导出版</span>
        <strong>{{ resumeStatusCount.exported }}</strong>
        <small>已离开工作台</small>
      </div>
    </div>

    <WorkbenchPanel
      eyebrow="Version Tree"
      title="成品简历版本库"
      :icon="GitBranch"
      description="左侧选择简历线和版本，右侧查看与执行版本动作。"
    >
      <template #actions>
        <input
          ref="importInput"
          class="file-input"
          type="file"
          accept=".json,.md,.txt,.html"
          @change="handleImportChange"
        />
        <WorkbenchButton size="sm" variant="primary" @click="importInput?.click()">
          <FileUp :size="14" />
          导入成品
        </WorkbenchButton>
      </template>

      <p v-if="importError" class="state-error" role="alert">{{ importError }}</p>

      <div v-if="selectedDocument && selectedVersion" class="resume-manager">
        <aside class="resume-tree" aria-label="简历版本树">
          <section v-for="group in groupedDocuments" :key="group.targetRole" class="resume-role">
            <h4>{{ group.targetRole }}</h4>
            <article v-for="document in group.documents" :key="document.id" class="resume-line">
              <button type="button" @click="selectDocument(document)">
                <strong>{{ document.title }}</strong>
                <span>当前 v{{ currentVersion(document).version }} · {{ statusLabel[currentVersion(document).status] }}</span>
              </button>
              <ol>
                <li v-for="version in sortedVersions(document)" :key="version.id">
                  <button
                    type="button"
                    :class="{
                      'is-selected': version.id === selectedVersion?.id,
                      'is-current': version.id === document.activeVersionId
                    }"
                    @click="selectVersion(document, version)"
                  >
                    <span class="version-number">v{{ version.version }}</span>
                    <span class="version-copy">
                      <strong>{{ statusLabel[version.status] }}</strong>
                      <small>{{ version.changeNote }}</small>
                    </span>
                    <CircleCheck
                      v-if="version.id === document.activeVersionId"
                      class="current-mark"
                      :size="14"
                      aria-label="当前投递版"
                    />
                  </button>
                </li>
              </ol>
            </article>
          </section>
        </aside>

        <section class="resume-detail">
          <header>
            <div>
              <h3>{{ selectedDocument.title }}</h3>
              <p>{{ selectedDocument.targetRole }} · v{{ selectedVersion.version }} · {{ templateName(selectedVersion.templateId) }}</p>
            </div>
            <WorkbenchStatus :tone="statusTone(selectedVersion.status)">
              {{ statusLabel[selectedVersion.status] }}
            </WorkbenchStatus>
          </header>

          <dl class="detail-grid">
            <div>
              <dt>当前投递版</dt>
              <dd>v{{ activeVersion?.version ?? "-" }} · {{ activeVersion ? statusLabel[activeVersion.status] : "-" }}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{{ sourceLabel[selectedVersion.source] }}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{{ selectedVersion.updatedAt }}</dd>
            </div>
            <div>
              <dt>版本说明</dt>
              <dd>{{ selectedVersion.changeNote }}</dd>
            </div>
          </dl>

          <pre>{{ selectedVersion.content }}</pre>

          <footer>
            <WorkbenchButton
              v-if="selectedVersion.status === 'draft'"
              size="sm"
              variant="primary"
              @click="startEditing"
            >
              <FilePenLine :size="14" />
              编辑草稿
            </WorkbenchButton>
            <WorkbenchButton v-else size="sm" variant="dark" @click="startEditing">
              <FilePenLine v-if="lineDraft" :size="14" />
              <GitBranch v-else :size="14" />
              {{ lineDraft ? "打开现有草稿" : "派生新草稿" }}
            </WorkbenchButton>

            <WorkbenchButton
              v-if="selectedVersion.status === 'draft'"
              size="sm"
              variant="secondary"
              @click="store.finalizeResumeVersion(selectedDocument.id, selectedVersion.id)"
            >
              <CircleCheck :size="14" />
              定稿并设为当前
            </WorkbenchButton>

            <WorkbenchButton
              v-if="selectedVersion.status === 'final'"
              size="sm"
              variant="secondary"
              @click="store.markResumeVersionExported(selectedDocument.id, selectedVersion.id)"
            >
              <Send :size="14" />
              标记已导出
            </WorkbenchButton>

            <WorkbenchButton
              v-if="selectedVersion.status !== 'draft' && selectedVersion.id !== selectedDocument.activeVersionId"
              size="sm"
              variant="ghost"
              @click="store.setActiveResumeVersion(selectedDocument.id, selectedVersion.id)"
            >
              设为当前投递版
            </WorkbenchButton>

            <span v-if="selectedVersion.fileName" class="file-name">{{ selectedVersion.fileName }}</span>
          </footer>
        </section>
      </div>

      <div v-else class="empty-state">
        <FileText :size="18" />
        暂无成品简历
      </div>
    </WorkbenchPanel>

    <WorkbenchDrawer
      v-model:open="editorOpen"
      size="lg"
      :title="selectedDocument?.title ?? '编辑简历草稿'"
      description="保存不会覆盖定稿；确认定稿后才成为当前投递版。"
    >
      <div class="resume-editor">
        <div class="editor-grid">
          <label>
            简历名称
            <input v-model="form.title" type="text" maxlength="60" />
          </label>
          <label>
            目标岗位
            <input v-model="form.targetRole" type="text" maxlength="40" />
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
            <input v-model="form.changeNote" type="text" maxlength="36" />
          </label>
        </div>

        <label>
          简历内容
          <textarea v-model="form.content" rows="18" spellcheck="false"></textarea>
        </label>

        <p v-if="editorError" class="state-error" role="alert">{{ editorError }}</p>
      </div>

      <template #footer>
        <WorkbenchButton variant="secondary" @click="editorOpen = false">取消</WorkbenchButton>
        <WorkbenchButton variant="primary" @click="saveEditor">
          <Save :size="15" />
          保存草稿
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

.resume-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.resume-summary > div {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.resume-summary span,
.resume-summary small {
  color: var(--muted);
  font-size: 11px;
}

.resume-summary strong {
  color: var(--ink);
  font-size: 23px;
  line-height: 1;
}

.resume-manager {
  min-width: 0;
  display: grid;
  grid-template-columns: 312px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.resume-tree {
  min-width: 0;
  max-height: 680px;
  overflow-y: auto;
  padding-right: 3px;
}

.resume-role + .resume-role {
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}

.resume-role h4 {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
}

.resume-line + .resume-line {
  margin-top: 10px;
}

.resume-line > button {
  width: 100%;
  display: grid;
  gap: 3px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.resume-line > button:hover,
.resume-line > button:focus-visible {
  border-color: rgba(20, 123, 115, 0.38);
  outline: none;
}

.resume-line > button strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resume-line > button span {
  color: var(--muted);
  font-size: 11px;
}

.resume-line ol {
  display: grid;
  gap: 5px;
  margin: 6px 0 0;
  padding: 0 0 0 12px;
  list-style: none;
}

.resume-line ol button {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 18px;
  gap: 7px;
  align-items: center;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.resume-line ol button:hover,
.resume-line ol button:focus-visible,
.resume-line ol button.is-selected {
  border-color: rgba(20, 123, 115, 0.3);
  background: #f6fbfa;
  outline: none;
}

.version-number {
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
}

.version-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.version-copy strong {
  color: var(--ink);
  font-size: 11.5px;
}

.version-copy small {
  overflow: hidden;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-mark {
  color: var(--teal);
}

.resume-detail {
  min-width: 0;
  display: grid;
  gap: 13px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
}

.resume-detail > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.resume-detail > header > div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.resume-detail h3 {
  margin: 0;
  color: var(--ink);
  font-size: 19px;
  line-height: 1.3;
}

.resume-detail > header p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.detail-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.detail-grid > div {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
}

.detail-grid dt {
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 900;
}

.detail-grid dd {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resume-detail pre {
  max-height: 430px;
  min-height: 300px;
  margin: 0;
  overflow: auto;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.resume-detail footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-name {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 36px;
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
  min-height: 380px;
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
  .resume-manager {
    grid-template-columns: minmax(0, 1fr);
  }

  .resume-tree {
    max-height: none;
    overflow: visible;
  }

  .detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .resume-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .resume-summary,
  .detail-grid,
  .editor-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .resume-detail > header,
  .resume-detail footer {
    align-items: stretch;
    flex-direction: column;
  }

  .resume-detail footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .resume-line ol button {
    grid-template-columns: 36px minmax(0, 1fr) 18px;
  }
}
</style>
