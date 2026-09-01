<script setup lang="ts">
import { Bot } from "@lucide/vue";
import { RouterLink } from "vue-router";

withDefaults(
  defineProps<{
    eyebrow: string;
    title: string;
    description: string;
    agentAction: string;
    agentTo?: string;
    status?: string;
  }>(),
  {
    agentTo: "/student/workbench",
    status: ""
  }
);
</script>

<template>
  <section class="module-page">
    <header class="module-header">
      <div>
        <p>{{ eyebrow }}</p>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <div class="module-actions">
        <span v-if="status">{{ status }}</span>
        <RouterLink :to="agentTo">
          <Bot :size="17" />
          {{ agentAction }}
        </RouterLink>
      </div>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.module-page {
  width: min(1180px, 100%);
  display: grid;
  gap: 16px;
  margin: 0 auto;
}

.module-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.module-header > div:first-child {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.module-header p:first-child {
  margin: 0;
  color: var(--teal);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.module-header h2 {
  margin: 0;
  color: var(--ink);
  font-size: 27px;
  line-height: 1.25;
}

.module-header > div:first-child > p:last-child {
  margin: 0;
  max-width: 720px;
  color: var(--muted);
  line-height: 1.6;
}

.module-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  white-space: nowrap;
}

.module-actions > span {
  max-width: 260px;
  overflow: hidden;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 750;
  text-overflow: ellipsis;
}

.module-actions a {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: 7px;
  background: var(--ink);
  color: #fff;
  font-size: 12px;
  font-weight: 850;
}

@media (max-width: 760px) {
  .module-header {
    align-items: stretch;
    flex-direction: column;
  }

  .module-actions {
    justify-content: space-between;
    overflow: hidden;
  }

  .module-actions > span {
    flex: 1;
    min-width: 0;
  }

  .module-actions a {
    flex: 0 0 auto;
  }
}
</style>
