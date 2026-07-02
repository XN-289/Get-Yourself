<script setup lang="ts">
import {
  Award,
  BookOpen,
  Calendar,
  Compass,
  Flag,
  LoaderCircle,
  MessagesSquare,
  Sparkles,
  TrendingUp
} from "@lucide/vue";
import { onMounted, ref } from "vue";

import { growthApi } from "@/api/growth";
import type { GrowthSummary, TimelineItem } from "@/types/growth";

const items = ref<TimelineItem[]>([]);
const summary = ref<GrowthSummary | null>(null);
const loading = ref(true);
const filter = ref<string>("ALL");

const typeConfig: Record<string, { icon: typeof Award; label: string; color: string }> = {
  EVENT: { icon: Compass, label: "活动", color: "#3b82f6" },
  CHALLENGE: { icon: Flag, label: "挑战", color: "#f59e0b" },
  COACH_LOG: { icon: MessagesSquare, label: "教练日志", color: "#8b5cf6" },
  JOURNAL: { icon: BookOpen, label: "日记", color: "#10b981" },
  GROWTH_TAG: { icon: TrendingUp, label: "成长里程碑", color: "#ec4899" },
  ABILITY_SCORE: { icon: Award, label: "能力评分", color: "#6366f1" }
};

onMounted(async () => {
  try {
    const [timelineData, summaryData] = await Promise.all([
      growthApi.getTimeline(100),
      growthApi.getSummary()
    ]);
    items.value = timelineData;
    summary.value = summaryData;
  } catch {
    // silent
  } finally {
    loading.value = false;
  }
});

function filtered() {
  if (filter.value === "ALL") return items.value;
  return items.value.filter((item) => item.type === filter.value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
}

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return formatDate(iso);
}

function getTypeConfig(type: string) {
  return typeConfig[type] ?? { icon: Sparkles, label: type, color: "#6b7280" };
}
</script>

<template>
  <section class="growth-timeline-view">
    <header class="timeline-header">
      <div>
        <p class="eyebrow">成长轨迹</p>
        <h1>我的成长时间线</h1>
        <p>记录每一次成长，见证自己的变化。</p>
      </div>
    </header>

    <div v-if="summary" class="summary-strip">
      <article>
        <strong>{{ summary.totalExperiences }}</strong>
        <span>累计经历</span>
      </article>
      <article>
        <strong>{{ summary.daysSinceFirst }}</strong>
        <span>成长天数</span>
      </article>
      <article>
        <strong>{{ summary.activeDirections }}</strong>
        <span>成长方向</span>
      </article>
      <article>
        <strong>{{ summary.journalCount }}</strong>
        <span>日记篇数</span>
      </article>
    </div>

    <div v-if="summary && summary.topTags.length" class="top-tags">
      <span class="tag-label">最近活跃方向：</span>
      <span v-for="tag in summary.topTags" :key="tag" class="tag-pill">{{ tag }}</span>
    </div>

    <nav class="filter-bar">
      <button :class="{ active: filter === 'ALL' }" @click="filter = 'ALL'">全部</button>
      <button :class="{ active: filter === 'EVENT' }" @click="filter = 'EVENT'">活动</button>
      <button :class="{ active: filter === 'CHALLENGE' }" @click="filter = 'CHALLENGE'">挑战</button>
      <button :class="{ active: filter === 'JOURNAL' }" @click="filter = 'JOURNAL'">日记</button>
      <button :class="{ active: filter === 'COACH_LOG' }" @click="filter = 'COACH_LOG'">教练日志</button>
      <button :class="{ active: filter === 'GROWTH_TAG' }" @click="filter = 'GROWTH_TAG'">里程碑</button>
    </nav>

    <div v-if="loading" class="loading-state">
      <LoaderCircle :size="24" class="spin" />
      <span>加载中...</span>
    </div>

    <div v-else-if="filtered().length === 0" class="empty-state">
      <Calendar :size="48" />
      <p>还没有成长记录</p>
      <small>完成活动、写日记、和教练对话都会出现在这里</small>
    </div>

    <div v-else class="timeline-list">
      <article v-for="item in filtered()" :key="item.id" class="timeline-card">
        <div class="timeline-dot" :style="{ backgroundColor: getTypeConfig(item.type).color }">
          <component :is="getTypeConfig(item.type).icon" :size="14" />
        </div>
        <div class="timeline-content">
          <div class="timeline-meta">
            <span class="timeline-type" :style="{ color: getTypeConfig(item.type).color }">
              {{ getTypeConfig(item.type).label }}
            </span>
            <span class="timeline-date">{{ relativeDate(item.occurredAt) }}</span>
          </div>
          <h3>{{ item.title }}</h3>
          <p v-if="item.summary" class="timeline-summary">{{ item.summary }}</p>
          <div v-if="item.type === 'JOURNAL' && item.metadata.mood && item.metadata.mood !== 'NONE'" class="timeline-mood">
            心情：{{ { GREAT: "很棒", GOOD: "不错", OK: "一般", LOW: "低落", TOUGH: "艰难" }[item.metadata.mood as string] || item.metadata.mood }}
          </div>
          <div v-if="item.type === 'GROWTH_TAG'" class="timeline-stats">
            <span>证据 {{ item.metadata.evidenceCount }} 条</span>
            <span>评分 {{ item.metadata.score }}</span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.growth-timeline-view {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.timeline-header {
  margin-bottom: 2rem;
}

.timeline-header h1 {
  font-size: 1.75rem;
  margin: 0.25rem 0;
}

.timeline-header p {
  color: #6b7280;
  margin: 0;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.summary-strip article {
  background: #f9fafb;
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
}

.summary-strip strong {
  display: block;
  font-size: 1.5rem;
  color: #111827;
}

.summary-strip span {
  font-size: 0.8rem;
  color: #6b7280;
}

.top-tags {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.tag-label {
  font-size: 0.85rem;
  color: #6b7280;
}

.tag-pill {
  background: #ede9fe;
  color: #7c3aed;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
}

.filter-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.filter-bar button {
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: white;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-bar button.active {
  background: #111827;
  color: white;
  border-color: #111827;
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

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.timeline-list {
  position: relative;
  padding-left: 2rem;
}

.timeline-list::before {
  content: "";
  position: absolute;
  left: 11px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e5e7eb;
}

.timeline-card {
  position: relative;
  margin-bottom: 1.25rem;
}

.timeline-dot {
  position: absolute;
  left: -2rem;
  top: 0.25rem;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  z-index: 1;
}

.timeline-content {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
}

.timeline-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.timeline-type {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.timeline-date {
  font-size: 0.75rem;
  color: #9ca3af;
}

.timeline-content h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.timeline-summary {
  margin: 0;
  font-size: 0.85rem;
  color: #6b7280;
  line-height: 1.5;
}

.timeline-mood, .timeline-stats {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #9ca3af;
}

.timeline-stats {
  display: flex;
  gap: 1rem;
}

.eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  margin: 0;
}
</style>
