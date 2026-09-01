<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "neutral" | "accent" | "warning" | "success";
    truncate?: boolean;
  }>(),
  {
    tone: "neutral",
    truncate: true
  }
);
</script>

<template>
  <span class="workbench-status" :class="[`is-${tone}`, { 'is-truncated': truncate }]">
    <slot />
  </span>
</template>

<style scoped>
.workbench-status {
  min-height: 28px;
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
}

.workbench-status.is-truncated {
  overflow: hidden;
  text-overflow: ellipsis;
}

.workbench-status.is-accent {
  border-color: rgba(20, 123, 115, 0.22);
  background: #edf7f4;
  color: var(--teal-dark);
}

.workbench-status.is-warning {
  border-color: rgba(199, 144, 37, 0.24);
  background: #fbf3e2;
  color: #7d5a12;
}

.workbench-status.is-success {
  border-color: rgba(20, 123, 115, 0.24);
  background: #e8f6f1;
  color: var(--teal-dark);
}
</style>
