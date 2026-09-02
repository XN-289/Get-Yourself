<script setup lang="ts">
import { Download, FileUp, HardDrive } from "@lucide/vue";
import { computed, ref } from "vue";

import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchDialog from "@/components/ui/WorkbenchDialog.vue";
import WorkbenchPanel from "@/components/ui/WorkbenchPanel.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";
import { storeToRefs } from "pinia";
import { useStudentWorkbenchStore } from "@/stores/studentWorkbench";
import {
  buildResumeLibrary,
  importResumeLibraryFile,
  type CanonicalResumeLibrary,
  type ImportedResumeLibrary
} from "@/utils/resumeLibrary";

const store = useStudentWorkbenchStore();
const { resumeDocuments, resumeTemplates } = storeToRefs(store);

const importInput = ref<HTMLInputElement | null>(null);
const bridgeError = ref("");
const exportOpen = ref(false);
const importOpen = ref(false);
const imported = ref<ImportedResumeLibrary | null>(null);
const exported = ref<CanonicalResumeLibrary | null>(null);
const exportedFileName = ref("");

const currentVersionCount = computed(
  () => resumeDocuments.value.reduce((total, document) => total + document.versions.length, 0)
);

async function downloadLibrary() {
  bridgeError.value = "";
  try {
    const result = await buildResumeLibrary({
      documents: resumeDocuments.value,
      allowedTemplates: resumeTemplates.value
    });
    const blob = new Blob([JSON.stringify(result.library, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `get-yourself-resume-library-${result.library.generatedAt.replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    exported.value = result;
    exportedFileName.value = link.download;
    exportOpen.value = false;
    store.addTrace(
      "简历版本库导出",
      result.library.libraryId,
      `导出 ${result.documentCount} 条简历线 / ${result.versionCount} 个版本；写盘仍需 CLI --apply`
    );
  } catch (error) {
    bridgeError.value = error instanceof Error ? error.message : "简历版本库导出失败";
  }
}

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  bridgeError.value = "";
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    bridgeError.value = "简历版本库文件超过 2MB";
    input.value = "";
    return;
  }

  try {
    imported.value = await importResumeLibraryFile(await file.text(), file.name, resumeTemplates.value);
    importOpen.value = true;
  } catch (error) {
    bridgeError.value = error instanceof Error ? error.message : "简历版本库读取失败";
  } finally {
    input.value = "";
  }
}

function applyImport() {
  if (!imported.value) return;
  try {
    store.replaceResumeDocumentsFromLibrary(imported.value.library);
    importOpen.value = false;
  } catch (error) {
    bridgeError.value = error instanceof Error ? error.message : "简历版本库替换失败";
  }
}
</script>

<template>
  <WorkbenchPanel
    eyebrow="Local Library"
    title="本地简历版本库"
    :icon="HardDrive"
    description="显式导出或读取 v1 契约 JSON；浏览器不写 cli/data。"
  >
    <template #actions>
      <input
        ref="importInput"
        class="file-input"
        type="file"
        accept=".json,application/json"
        @change="handleImportChange"
      >
      <WorkbenchButton size="sm" @click="importInput?.click()">
        <FileUp :size="14" />
        读取版本库
      </WorkbenchButton>
      <WorkbenchButton size="sm" variant="primary" @click="exportOpen = true">
        <Download :size="14" />
        导出版本库
      </WorkbenchButton>
    </template>

    <p v-if="bridgeError" class="state-error" role="alert">{{ bridgeError }}</p>

    <dl class="library-summary">
      <div>
        <dt>当前会话</dt>
        <dd>{{ resumeDocuments.length }} 线 / {{ currentVersionCount }} 版</dd>
      </div>
      <div>
        <dt>已导出</dt>
        <dd>{{ exported ? `${exported.documentCount} 线 / ${exported.versionCount} 版` : "未导出" }}</dd>
      </div>
      <div>
        <dt>已读取</dt>
        <dd>{{ imported ? `${imported.documentCount} 线 / ${imported.versionCount} 版` : "未读取" }}</dd>
      </div>
      <div>
        <dt>契约</dt>
        <dd>resume-library v1</dd>
      </div>
    </dl>

    <footer v-if="exported" class="library-footer">
      <div class="command-list">
        <span>{{ exportedFileName }}</span>
        <code>node resume-library.mjs check {{ exportedFileName }}</code>
        <code>node resume-library.mjs import {{ exportedFileName }}</code>
        <code>node resume-library.mjs import {{ exportedFileName }} --apply</code>
      </div>
      <WorkbenchStatus tone="neutral">内容哈希 {{ exported.contentHash }}</WorkbenchStatus>
    </footer>

    <WorkbenchDialog
      v-model:open="exportOpen"
      title="确认导出简历版本库"
      :description="`${resumeDocuments.length} 条简历线 / ${currentVersionCount} 个版本`"
    >
      <p>
        导出的 JSON 包含简历全文，仅保存到本机下载目录。它不修改 cv.md、素材包、定稿计划或渲染 HTML；安装到本地数据根仍需 CLI dry-run 和显式 --apply。
      </p>
      <template #footer>
        <WorkbenchButton size="sm" @click="exportOpen = false">取消</WorkbenchButton>
        <WorkbenchButton size="sm" variant="primary" @click="downloadLibrary">
          <Download :size="15" />
          确认导出
        </WorkbenchButton>
      </template>
    </WorkbenchDialog>

    <WorkbenchDialog
      v-model:open="importOpen"
      title="确认读取版本库"
      :description="imported?.fileName ?? ''"
    >
      <dl v-if="imported" class="confirm-grid">
        <div>
          <dt>简历线</dt>
          <dd>{{ imported.documentCount }}</dd>
        </div>
        <div>
          <dt>版本</dt>
          <dd>{{ imported.versionCount }}</dd>
        </div>
        <div>
          <dt>当前会话</dt>
          <dd>{{ resumeDocuments.length }} / {{ currentVersionCount }}</dd>
        </div>
        <div>
          <dt>内容哈希</dt>
          <dd :title="imported.contentHash">{{ imported.contentHash.slice(0, 18) }}…</dd>
        </div>
      </dl>
      <p>确认后替换当前会话的简历线与版本树；本地文件、cv.md 和渲染产物不会被修改。</p>
      <template #footer>
        <WorkbenchButton size="sm" @click="importOpen = false">取消</WorkbenchButton>
        <WorkbenchButton size="sm" variant="primary" @click="applyImport">
          <FileUp :size="15" />
          确认读取
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

.library-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin: 0;
}

.library-summary > div {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
}

.library-summary dt {
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
}

.library-summary dd {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.command-list {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.command-list span,
.command-list code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-list span {
  color: var(--muted);
  font-size: 11px;
}

.command-list code {
  color: var(--teal-dark);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
}

.confirm-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.confirm-grid > div {
  display: grid;
  gap: 3px;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
}

.confirm-grid dt {
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
}

.confirm-grid dd {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-dialog p {
  margin: 0;
}

@media (max-width: 760px) {
  .library-summary,
  .confirm-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .library-summary,
  .confirm-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .library-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .command-list code {
    white-space: normal;
    word-break: break-all;
  }
}
</style>
