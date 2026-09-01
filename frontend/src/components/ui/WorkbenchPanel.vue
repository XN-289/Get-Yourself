<script setup lang="ts">
import type { LucideIcon } from "@lucide/vue";

withDefaults(
  defineProps<{
    description?: string;
    eyebrow?: string;
    icon?: LucideIcon | null;
    title: string;
  }>(),
  {
    description: "",
    eyebrow: "",
    icon: null
  }
);
</script>

<template>
  <section class="workbench-panel">
    <header>
      <div class="workbench-panel-copy">
        <p v-if="eyebrow">{{ eyebrow }}</p>
        <h3>{{ title }}</h3>
        <p v-if="description">{{ description }}</p>
      </div>
      <div class="workbench-panel-side">
        <component :is="icon" v-if="icon" :size="19" />
        <slot name="actions" />
      </div>
    </header>

    <slot />
  </section>
</template>

<style scoped>
.workbench-panel {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 13px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.workbench-panel > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 13px;
}

.workbench-panel-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.workbench-panel-copy > p:first-child {
  margin: 0;
  color: var(--teal);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.workbench-panel-copy h3 {
  margin: 0;
  color: var(--ink);
  font-size: 17px;
  line-height: 1.3;
}

.workbench-panel-copy > p:last-child {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.workbench-panel-side {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
}

.workbench-panel-side > svg {
  color: var(--teal);
}

@media (max-width: 640px) {
  .workbench-panel {
    padding: 13px;
  }

  .workbench-panel > header {
    align-items: stretch;
    flex-direction: column;
  }

  .workbench-panel-side {
    justify-content: space-between;
  }
}
</style>
