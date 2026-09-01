import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

import { useAuthStore } from "@/stores/auth";
import type { UserRole } from "@/types/auth";
import AuthView from "@/views/AuthView.vue";
import FrozenAccountView from "@/views/FrozenAccountView.vue";
import StudentLayout from "@/views/StudentLayout.vue";
import StudentAgentWorkbenchDemoView from "@/views/StudentAgentWorkbenchDemoView.vue";
import WorkspacePlaceholder from "@/views/WorkspacePlaceholder.vue";

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    guestOnly?: boolean;
    roles?: UserRole[];
    title?: string;
    description?: string;
    section?: string;
  }
}

const studentWorkbenchRedirect = { path: "/student/workbench", query: { focus: "assets" } };
const studentChildren: RouteRecordRaw[] = [
  {
    path: "workbench",
    name: "student-agent-workbench",
    component: StudentAgentWorkbenchDemoView,
    meta: { title: "Agent 工作台", section: "Agent 主入口" }
  },
  { path: "growth/timeline", redirect: studentWorkbenchRedirect },
  { path: "growth/journal", redirect: studentWorkbenchRedirect },
  { path: "achievements", redirect: studentWorkbenchRedirect },
  { path: "schedule", redirect: "/student/workbench" },
  { path: "challenges", redirect: "/student/workbench" },
  { path: "coach", redirect: "/student/workbench" },
  { path: "events", redirect: "/student/workbench" },
  { path: "reservations", redirect: "/student/workbench" },
  { path: "follows", redirect: "/student/workbench" }
];

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: "/",
      name: "root",
      component: WorkspacePlaceholder,
      meta: { title: "Get Yourself" }
    },
    {
      path: "/login",
      name: "login",
      component: AuthView,
      props: { mode: "login" },
      meta: { guestOnly: true, title: "登录" }
    },
    {
      path: "/register",
      name: "register",
      component: AuthView,
      props: { mode: "register" },
      meta: { guestOnly: true, title: "注册" }
    },
    {
      path: "/student",
      component: StudentLayout,
      redirect: "/student/workbench",
      meta: { requiresAuth: true, roles: ["STUDENT"] },
      children: studentChildren
    },
    {
      path: "/account-frozen",
      name: "account-frozen",
      component: FrozenAccountView,
      meta: { requiresAuth: true, roles: ["SOCIAL"], title: "功能已冻结" }
    },
    {
      path: "/social",
      name: "social-frozen",
      redirect: "/account-frozen"
    },
    {
      path: "/social/:pathMatch(.*)*",
      name: "social-frozen-path",
      redirect: "/account-frozen"
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: WorkspacePlaceholder,
      meta: {
        title: "页面不存在",
        description: "这个地址暂时没有对应的功能页面。"
      }
    }
  ]
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  await authStore.initialize();

  if (to.name === "root") {
    return authStore.isAuthenticated ? authStore.homeRoute : "/login";
  }
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return authStore.homeRoute;
  }
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.roles?.length && authStore.role && !to.meta.roles.includes(authStore.role)) {
    return authStore.homeRoute;
  }

  document.title = to.meta.title ? `${to.meta.title} | Get Yourself` : "Get Yourself";
  return true;
});

export default router;
