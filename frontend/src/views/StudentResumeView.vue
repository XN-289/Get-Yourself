<script setup lang="ts">
import { FileText, FileUp, PenLine, Save } from "@lucide/vue";
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";

import StudentWorkbenchModule from "@/components/student/StudentWorkbenchModule.vue";
import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDrawer from "@/components/ui/WorkbenchDrawer.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";
import type { ResumeDocument, ResumeDocumentInput, ResumeDocumentStatus } from "@/stores/studentWorkbench";

type UnknownRecord = Record<string, unknown>;

const store = useStudentWorkbenchStore();
const { resumeDocuments, resumeStatusCount, resumeTemplates } = storeToRefs(store);

const importInput = ref<HTMLInputElement | null>(null);
const importError = ref("");
const editorError = ref("");
const editorOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  title: "",
  targetRole: "",
  templateId: "classic-ats",
  status: "final" as ResumeDocumentStatus,
  content: ""
});

const statusLabel: Record<ResumeDocumentStatus, string> = {
  editing: "编辑中",
  final: "已定稿",
  exported: "已导出"
};

const sourceLabel: Record<ResumeDocument["source"], string> = {
  agent: "Agent",
  import: "导入",
  manual: "手工"
};

const editingResume = computed(() => resumeDocuments.value.find((item) => item.id === editingId.value) ?? null);

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
  const contact = joinParts([
    asString(header?.location),
    asString(header?.email),
    asString(header?.phone)
  ], " / ");
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
    return [
      `### ${joinParts([company, role])}${meta ? ` · ${meta}` : ""}`,
      ...asBullets(record.bullets)
    ];
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
    status: "final",
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
    status: "final",
    source: "import",
    fileName
  };
}

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  importError.value = "";
  if (!file) return;

  try {
    store.importResumeDocument(documentInputFromText(await file.text(), file.name));
  } catch (error) {
    importError.value = error instanceof Error ? error.message : "简历导入失败";
  } finally {
    input.value = "";
  }
}

function openEditor(resume: ResumeDocument) {
  editorError.value = "";
  editingId.value = resume.id;
  Object.assign(form, {
    title: resume.title,
    targetRole: resume.targetRole,
    templateId: resume.templateId,
    status: resume.status,
    content: resume.content
  });
  editorOpen.value = true;
}

function saveEditor() {
  if (editingId.value === null) return;
  try {
    store.updateResumeDocument(editingId.value, { ...form });
    editorOpen.value = false;
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : "简历保存失败";
  }
}

function templateName(templateId: string) {
  return resumeTemplates.value.find((template) => template.id === templateId)?.nameZh ?? "经典 ATS";
}

function resumePreview(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n");
}

function statusTone(status: ResumeDocumentStatus) {
  if (status === "exported") return "success" as const;
  if (status === "final") return "accent" as const;
  return "warning" as const;
}
</script>

<template>
  <StudentWorkbenchModule
    eyebrow="Resume Library"
    title="简历管理"
    description="以成品简历为管理对象，支持本机导入、编辑和版本标记。"
    agent-action="回 Agent 生成"
    status="本地读取 · 不上传"
  >
    <WorkbenchPanel
      eyebrow="Documents"
      title="成品简历库"
      :icon="FileText"
      description="每一张卡片都是一份完整简历，不再是候选素材或模板说明。"
    >
      <template #actions>
        <WorkbenchStatus tone="accent">定稿 {{ resumeStatusCount.final }}</WorkbenchStatus>
        <WorkbenchStatus tone="success">导出 {{ resumeStatusCount.exported }}</WorkbenchStatus>
        <input
          ref="importInput"
          class="file-input"
          type="file"
          accept=".json,.md,.txt,.html"
          @change="handleImportChange"
        />
        <WorkbenchButton size="sm" variant="primary" @click="importInput?.click()">
          <FileUp :size="14" />
          导入
        </WorkbenchButton>
      </template>

      <p v-if="importError" class="import-error" role="alert">{{ importError }}</p>
      <ul class="resume-library" aria-label="成品简历">
        <li v-for="resume in resumeDocuments" :key="resume.id">
          <article class="resume-card" :class="{ 'is-exported': resume.status === 'exported' }">
            <header>
              <div>
                <h4>{{ resume.title }}</h4>
                <p>{{ resume.targetRole }} · v{{ resume.version }} · {{ templateName(resume.templateId) }}</p>
              </div>
              <WorkbenchStatus :tone="statusTone(resume.status)">{{ statusLabel[resume.status] }}</WorkbenchStatus>
            </header>

            <pre>{{ resumePreview(resume.content) }}</pre>

            <footer>
              <span>
                {{ sourceLabel[resume.source] }} · {{ resume.updatedAt }}
                <template v-if="resume.fileName"> · {{ resume.fileName }}</template>
              </span>
              <WorkbenchButton size="sm" variant="dark" @click="openEditor(resume)">
                <PenLine :size="14" />
                编辑
              </WorkbenchButton>
            </footer>
          </article>
        </li>
      </ul>
    </WorkbenchPanel>

    <WorkbenchDrawer
      v-model:open="editorOpen"
      size="lg"
      :title="editingResume?.title ?? '编辑简历'"
      description="修改会形成新的本地版本，不会自动同步到平台。"
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
            状态
            <select v-model="form.status">
              <option value="editing">编辑中</option>
              <option value="final">已定稿</option>
              <option value="exported">已导出</option>
            </select>
          </label>
        </div>

        <label>
          简历内容
          <textarea v-model="form.content" rows="18" spellcheck="false"></textarea>
        </label>

        <p v-if="editorError" class="import-error" role="alert">{{ editorError }}</p>
      </div>

      <template #footer>
        <WorkbenchButton variant="secondary" @click="editorOpen = false">取消</WorkbenchButton>
        <WorkbenchButton variant="primary" @click="saveEditor">
          <Save :size="15" />
          保存修改
        </WorkbenchButton>
      </template>
    </WorkbenchDrawer>
  </StudentWorkbenchModule>
</template>

<style scoped>
.file-input {
  display: none;
}

.import-error {
  margin: 0;
  padding: 9px 11px;
  border: 1px solid rgba(180, 72, 58, 0.28);
  border-radius: 7px;
  background: #fdf1ef;
  color: #8f3428;
  font-size: 12px;
  line-height: 1.5;
}

.resume-library {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.resume-card {
  min-width: 0;
  min-height: 242px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 11px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.resume-card.is-exported {
  border-color: rgba(20, 123, 115, 0.3);
  background: #fbfdfd;
}

.resume-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.resume-card header > div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.resume-card h4 {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.35;
}

.resume-card header p {
  margin: 0;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.resume-card pre {
  min-height: 0;
  margin: 0;
  overflow: hidden;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
  color: var(--muted);
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1.62;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.resume-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.resume-card footer > span {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@media (max-width: 900px) {
  .resume-library {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .resume-card {
    min-height: 0;
  }

  .resume-card header,
  .resume-card footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .editor-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
