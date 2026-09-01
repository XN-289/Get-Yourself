<script setup lang="ts">
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from "reka-ui";

withDefaults(
  defineProps<{
    description?: string;
    title: string;
  }>(),
  {
    description: ""
  }
);

const open = defineModel<boolean>("open", { default: false });
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="workbench-dialog-overlay" />
      <DialogContent class="workbench-dialog">
        <DialogTitle class="workbench-dialog-title">
          {{ title }}
        </DialogTitle>
        <DialogDescription v-if="description" class="workbench-dialog-description">
          {{ description }}
        </DialogDescription>
        <div class="workbench-dialog-body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="workbench-dialog-footer">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.workbench-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(23, 33, 36, 0.48);
}

.workbench-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 91;
  width: min(430px, calc(100vw - 32px));
  max-height: calc(100vh - 36px);
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  box-shadow: 0 28px 78px rgba(23, 33, 36, 0.24);
  transform: translate(-50%, -50%);
}

.workbench-dialog-title {
  margin: 0;
  font-size: 18px;
}

.workbench-dialog-description {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.workbench-dialog-body {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}

.workbench-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
