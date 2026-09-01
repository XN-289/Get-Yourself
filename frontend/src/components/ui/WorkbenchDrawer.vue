<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from "reka-ui";
import { X } from "@lucide/vue";

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
      <DialogOverlay class="workbench-drawer-overlay" />
      <DialogContent class="workbench-drawer">
        <header class="workbench-drawer-header">
          <div>
            <DialogTitle class="workbench-drawer-title">
              {{ title }}
            </DialogTitle>
            <DialogDescription v-if="description" class="workbench-drawer-description">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose aria-label="关闭抽屉" class="workbench-drawer-close" type="button">
            <X :size="16" />
          </DialogClose>
        </header>
        <div class="workbench-drawer-body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="workbench-drawer-footer">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.workbench-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(23, 33, 36, 0.44);
}

.workbench-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 91;
  width: min(430px, calc(100vw - 18px));
  max-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  border-left: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  box-shadow: -24px 0 70px rgba(23, 33, 36, 0.2);
  animation: workbench-drawer-in 150ms ease-out;
}

.workbench-drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 14px;
  border-bottom: 1px solid var(--line);
}

.workbench-drawer-header > div {
  min-width: 0;
}

.workbench-drawer-title {
  margin: 0;
  font-size: 18px;
}

.workbench-drawer-description {
  display: block;
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.workbench-drawer-close {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--muted);
  transition:
    border-color 120ms ease,
    color 120ms ease;
}

.workbench-drawer-close:hover {
  border-color: rgba(20, 123, 115, 0.34);
  color: var(--teal-dark);
}

.workbench-drawer-close:focus-visible {
  outline: 2px solid rgba(20, 123, 115, 0.22);
  outline-offset: 2px;
}

.workbench-drawer-body {
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}

.workbench-drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--line);
  background: #fff;
}

@keyframes workbench-drawer-in {
  from {
    transform: translateX(14px);
    opacity: 0.72;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
