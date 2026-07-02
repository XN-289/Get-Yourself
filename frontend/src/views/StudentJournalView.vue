<script setup lang="ts">
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Edit3,
  LoaderCircle,
  Plus,
  SmilePlus,
  Trash2,
  X
} from "@lucide/vue";
import { onMounted, reactive, ref } from "vue";

import { ApiError } from "@/api/client";
import { journalApi } from "@/api/growth";
import type { JournalEntry } from "@/types/growth";

const entries = ref<JournalEntry[]>([]);
const loading = ref(true);
const modalOpen = ref(false);
const editTarget = ref<JournalEntry | null>(null);
const busy = ref(false);
const notice = ref("");
const page = ref(0);
const totalPages = ref(0);

const form = reactive({
  entryDate: new Date().toISOString().slice(0, 10),
  title: "",
  content: "",
  mood: ""
});

const moods = [
  { value: "GREAT", label: "很棒", emoji: "😄" },
  { value: "GOOD", label: "不错", emoji: "😊" },
  { value: "OK", label: "一般", emoji: "😐" },
  { value: "LOW", label: "低落", emoji: "😔" },
  { value: "TOUGH", label: "艰难", emoji: "😣" }
];

onMounted(() => load(0));

async function load(index: number) {
  loading.value = true;
  try {
    const result = await journalApi.getPage(index, 8);
    entries.value = result.content;
    page.value = result.number;
    totalPages.value = result.totalPages;
  } catch {
    notice.value = "加载失败";
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editTarget.value = null;
  form.entryDate = new Date().toISOString().slice(0, 10);
  form.title = "";
  form.content = "";
  form.mood = "";
  modalOpen.value = true;
}

function openEdit(entry: JournalEntry) {
  editTarget.value = entry;
  form.entryDate = entry.entryDate;
  form.title = entry.title;
  form.content = entry.content;
  form.mood = entry.mood ?? "";
  modalOpen.value = true;
}

function closeModal() {
  modalOpen.value = false;
  editTarget.value = null;
}

async function submit() {
  busy.value = true;
  notice.value = "";
  try {
    if (editTarget.value) {
      await journalApi.update(editTarget.value.id, {
        entryDate: form.entryDate,
        title: form.title,
        content: form.content,
        mood: form.mood || undefined
      });
      notice.value = "日记已更新";
    } else {
      await journalApi.create({
        entryDate: form.entryDate,
        title: form.title,
        content: form.content,
        mood: form.mood || undefined
      });
      notice.value = "日记已保存";
    }
    closeModal();
    await load(page.value);
  } catch (cause) {
    notice.value = cause instanceof ApiError ? cause.message : "保存失败";
  } finally {
    busy.value = false;
  }
}

async function remove(entry: JournalEntry) {
  if (!confirm(`确定删除「${entry.title}」？`)) return;
  try {
    await journalApi.delete(entry.id);
    await load(page.value);
    notice.value = "已删除";
  } catch {
    notice.value = "删除失败";
  }
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(dateStr));
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function moodEmoji(mood: string | null) {
  if (!mood) return "";
  return moods.find((m) => m.value === mood)?.emoji ?? "";
}
</script>

<template>
  <section class="journal-view">
    <header class="journal-header">
      <div>
        <p class="eyebrow">成长日记</p>
        <h1>我的日记</h1>
        <p>记录每天的想法、感受和成长。</p>
      </div>
      <button class="primary-action" @click="openCreate">
        <Plus :size="18" />
        <span>写日记</span>
      </button>
    </header>

    <p v-if="notice" class="notice">{{ notice }}</p>

    <div v-if="loading" class="loading-state">
      <LoaderCircle :size="24" class="spin" />
      <span>加载中...</span>
    </div>

    <div v-else-if="entries.length === 0" class="empty-state">
      <BookOpen :size="48" />
      <p>还没有日记</p>
      <small>每天花几分钟记录你的想法和感受</small>
      <button class="primary-action" @click="openCreate">写第一篇日记</button>
    </div>

    <div v-else class="journal-list">
      <article v-for="entry in entries" :key="entry.id" class="journal-card">
        <div class="journal-card-header">
          <div>
            <span class="journal-date">{{ formatDate(entry.entryDate) }}</span>
            <span v-if="entry.mood" class="journal-mood">{{ moodEmoji(entry.mood) }}</span>
          </div>
          <div class="journal-actions">
            <button class="icon-btn" title="编辑" @click="openEdit(entry)">
              <Edit3 :size="16" />
            </button>
            <button class="icon-btn" title="删除" @click="remove(entry)">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
        <h3>{{ entry.title }}</h3>
        <p class="journal-preview">{{ truncate(entry.content, 200) }}</p>
      </article>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button :disabled="page === 0" @click="load(page - 1)">
        <ChevronLeft :size="16" />
      </button>
      <span>{{ page + 1 }} / {{ totalPages }}</span>
      <button :disabled="page >= totalPages - 1" @click="load(page + 1)">
        <ChevronRight :size="16" />
      </button>
    </div>

    <Teleport to="body">
      <Transition name="modal">
        <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
          <div class="modal-panel">
            <header>
              <h2>{{ editTarget ? "编辑日记" : "写日记" }}</h2>
              <button class="icon-btn" @click="closeModal"><X :size="20" /></button>
            </header>

            <form @submit.prevent="submit">
              <label class="form-field">
                <span>日期</span>
                <input v-model="form.entryDate" type="date" required />
              </label>

              <label class="form-field">
                <span>心情</span>
                <div class="mood-selector">
                  <button
                    v-for="m in moods"
                    :key="m.value"
                    type="button"
                    :class="{ active: form.mood === m.value }"
                    @click="form.mood = form.mood === m.value ? '' : m.value"
                  >
                    <span class="mood-emoji">{{ m.emoji }}</span>
                    <span class="mood-label">{{ m.label }}</span>
                  </button>
                </div>
              </label>

              <label class="form-field">
                <span>标题</span>
                <input v-model="form.title" placeholder="今天发生了什么？" required maxlength="200" />
              </label>

              <label class="form-field">
                <span>内容</span>
                <textarea
                  v-model="form.content"
                  placeholder="写下你的想法、感受、学到的东西..."
                  required
                  maxlength="10000"
                  rows="8"
                />
              </label>

              <div class="modal-actions">
                <button type="button" class="secondary-action" @click="closeModal">取消</button>
                <button type="submit" class="primary-action" :disabled="busy">
                  {{ busy ? "保存中..." : editTarget ? "更新" : "保存" }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.journal-view {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.journal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.journal-header h1 {
  font-size: 1.75rem;
  margin: 0.25rem 0;
}

.journal-header p {
  color: #6b7280;
  margin: 0;
}

.notice {
  background: #f0fdf4;
  color: #166534;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #9ca3af;
}

.empty-state p {
  font-size: 1.1rem;
  color: #6b7280;
  margin: 0.5rem 0 0.25rem;
}

.empty-state .primary-action {
  margin-top: 1rem;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.journal-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.journal-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
  transition: box-shadow 0.15s;
}

.journal-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.journal-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.journal-date {
  font-size: 0.8rem;
  color: #9ca3af;
}

.journal-mood {
  margin-left: 0.5rem;
  font-size: 1.1rem;
}

.journal-actions {
  display: flex;
  gap: 0.25rem;
}

.journal-card h3 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.journal-preview {
  margin: 0;
  font-size: 0.9rem;
  color: #6b7280;
  line-height: 1.6;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
}

.pagination button {
  padding: 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-panel {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
}

.modal-panel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.modal-panel header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.form-field {
  display: block;
  margin-bottom: 1rem;
}

.form-field > span {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.4rem;
  color: #374151;
}

.form-field input, .form-field textarea {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  box-sizing: border-box;
}

.form-field textarea {
  resize: vertical;
}

.mood-selector {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.mood-selector button {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.15s;
}

.mood-selector button.active {
  border-color: #3b82f6;
  background: #eff6ff;
}

.mood-emoji {
  font-size: 1.5rem;
}

.mood-label {
  font-size: 0.7rem;
  color: #6b7280;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.primary-action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.2rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s;
}

.primary-action:hover {
  background: #1f2937;
}

.primary-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary-action {
  padding: 0.6rem 1.2rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
}

.icon-btn {
  padding: 0.4rem;
  border: none;
  background: none;
  cursor: pointer;
  color: #9ca3af;
  border-radius: 6px;
}

.icon-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  margin: 0;
}

.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s;
}

.modal-enter-from, .modal-leave-to {
  opacity: 0;
}
</style>
