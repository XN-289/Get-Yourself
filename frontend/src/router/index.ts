import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

import { useAuthStore } from "@/stores/auth";
import type { UserRole } from "@/types/auth";
import AuthView from "@/views/AuthView.vue";
import FrozenAccountView from "@/views/FrozenAccountView.vue";
import StudentAchievementsView from "@/views/StudentAchievementsView.vue";
import StudentChallengesView from "@/views/StudentChallengesView.vue";
import StudentCoachView from "@/views/StudentCoachView.vue";
import StudentGrowthTimelineView from "@/views/StudentGrowthTimelineView.vue";
import StudentJournalView from "@/views/StudentJournalView.vue";
import StudentLayout from "@/views/StudentLayout.vue";
import StudentLocalWorkbenchDemoView from "@/views/StudentLocalWorkbenchDemoView.vue";
import StudentModulePlaceholder from "@/views/StudentModulePlaceholder.vue";
import StudentScheduleView from "@/views/StudentScheduleView.vue";
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

const studentChildren: RouteRecordRaw[] = [
  ["growth/timeline", "student-growth-timeline", "成长时间线", "成长"],
  ["growth/journal", "student-growth-journal", "成长日记", "成长"],
  ["schedule", "student-schedule", "日程", "行动管理"],
  ["challenges", "student-challenges", "挑战", "行动管理"],
  ["coach", "student-coach", "教练", "成长复盘"],
  ["achievements", "student-achievements", "能力档案", "成长档案"]
].map(([path, name, title, section]) => ({
  path,
  name,
  component:
    path === "growth/timeline"
      ? StudentGrowthTimelineView
      : path === "growth/journal"
        ? StudentJournalView
        : path === "achievements"
          ? StudentAchievementsView
          : path === "schedule"
            ? StudentScheduleView
            : path === "challenges"
              ? StudentChallengesView
              : path === "coach"
                ? StudentCoachView
              : StudentModulePlaceholder,
  meta: { title, section }
}));

studentChildren.push(
  {
    path: "workbench",
    name: "student-local-workbench",
    component: StudentLocalWorkbenchDemoView,
    meta: { title: "本地工作台", section: "求职执行" }
  },
  ...([
    { path: "events", redirect: "/student/growth/timeline" },
    { path: "reservations", redirect: "/student/growth/timeline" },
    { path: "follows", redirect: "/student/growth/timeline" }
  ] as RouteRecordRaw[])
);

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
      redirect: "/student/growth/timeline",
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
