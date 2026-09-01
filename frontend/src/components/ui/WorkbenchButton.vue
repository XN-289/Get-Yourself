<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    size?: "sm" | "md";
    title?: string;
    to?: string;
    type?: "button" | "submit";
    variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  }>(),
  {
    disabled: false,
    size: "md",
    title: "",
    to: "",
    type: "button",
    variant: "secondary"
  }
);

const component = computed(() => (props.to ? RouterLink : "button"));
</script>

<template>
  <component
    :is="component"
    :to="to || undefined"
    :type="to ? undefined : type"
    :disabled="to ? undefined : disabled"
    :title="title || undefined"
    class="workbench-button"
    :class="[`is-${variant}`, `is-${size}`]"
  >
    <slot />
  </component>
</template>

<style scoped>
.workbench-button {
  min-height: 38px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 850;
  line-height: 1;
  cursor: pointer;
  transition:
    background 130ms ease,
    border-color 130ms ease,
    color 130ms ease,
    opacity 130ms ease;
}

.workbench-button.is-sm {
  min-height: 32px;
  padding: 0 9px;
  font-size: 11px;
}

.workbench-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.workbench-button.is-primary {
  border-color: var(--teal);
  background: var(--teal);
  color: #fff;
}

.workbench-button.is-primary:hover:not(:disabled) {
  background: var(--teal-dark);
}

.workbench-button.is-secondary {
  border-color: var(--line);
  background: #fff;
  color: var(--ink);
}

.workbench-button.is-secondary:hover:not(:disabled) {
  border-color: rgba(20, 123, 115, 0.36);
  color: var(--teal-dark);
}

.workbench-button.is-ghost {
  background: transparent;
  color: var(--muted);
}

.workbench-button.is-ghost:hover:not(:disabled) {
  background: rgba(20, 123, 115, 0.08);
  color: var(--teal-dark);
}

.workbench-button.is-danger {
  border-color: #b4483a;
  background: #b4483a;
  color: #fff;
}

.workbench-button.is-danger:hover:not(:disabled) {
  background: #9a3c30;
}

.workbench-button.is-dark {
  background: var(--ink);
  color: #fff;
}

.workbench-button.is-dark:hover:not(:disabled) {
  background: #263a3d;
}
</style>
