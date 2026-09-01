import {
  Award,
  Bot,
  FileText,
  ListChecks,
  type LucideIcon
} from "@lucide/vue";

export interface StudentNavigationItem {
  to: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
}

export interface StudentNavigationGroup {
  label: string;
  items: StudentNavigationItem[];
}

export const studentNavigationGroups: StudentNavigationGroup[] = [
  {
    label: "主入口",
    items: [
      { to: "/student/workbench", label: "Agent 工作台", shortLabel: "Agent", icon: Bot }
    ]
  },
  {
    label: "求职对象",
    items: [
      { to: "/student/workbench?focus=assets", label: "能力资产", shortLabel: "资产", icon: Award },
      { to: "/student/workbench?focus=resume", label: "简历管理", shortLabel: "简历", icon: FileText },
      { to: "/student/workbench?focus=interview", label: "面试管理", shortLabel: "面试", icon: ListChecks }
    ]
  }
];

export const studentNavigationItems = studentNavigationGroups.flatMap((group) => group.items);

export const studentMobilePrimaryItems = studentNavigationItems;
