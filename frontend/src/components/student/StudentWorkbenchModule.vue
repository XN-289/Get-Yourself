<script setup lang="ts">
import { Bot } from "@lucide/vue";

import WorkbenchButton from "@/components/ui/WorkbenchButton.vue";
import WorkbenchStatus from "@/components/ui/WorkbenchStatus.vue";

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
        <WorkbenchStatus v-if="status" tone="accent">{{ status }}</WorkbenchStatus>
        <WorkbenchButton :to="agentTo" variant="dark">
          <Bot :size="17" />
          {{ agentAction }}
        </WorkbenchButton>
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

@media (max-width: 760px) {
  .module-header {
    align-items: stretch;
    flex-direction: column;
  }

  .module-actions {
    justify-content: space-between;
    overflow: hidden;
  }

  .module-actions > :first-child {
    flex: 1;
    min-width: 0;
  }
}
</style>
