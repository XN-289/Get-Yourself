<script setup lang="ts">
import { LogOut } from "@lucide/vue";
import { useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const router = useRouter();

async function logout() {
  await authStore.logout();
  await router.replace("/login");
}
</script>

<template>
  <section class="workspace-view">
    <header class="view-heading">
      <div>
        <p class="eyebrow">FROZEN</p>
        <h1>功能已冻结</h1>
        <p>当前版本专注学生成长与本地求职工作台，社会端能力暂时不可用。</p>
      </div>
      <button class="icon-button" type="button" title="退出登录" @click="logout">
        <LogOut :size="18" />
      </button>
    </header>

    <div class="migration-board">
      <div class="migration-copy">
        <p class="eyebrow">账号状态</p>
        <h2>已有社会端账号已保留，但入口暂停服务。</h2>
        <p>如果你需要继续使用学生端，请使用学生账号登录。</p>
      </div>
    </div>
  </section>
</template>
