import {
  Award,
  BookOpen,
  CalendarDays,
  Flag,
  History,
  MessagesSquare,
  MonitorSmartphone,
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
    label: "成长",
    items: [
      { to: "/student/growth/timeline", label: "成长时间线", shortLabel: "时间线", icon: History },
      { to: "/student/growth/journal", label: "成长日记", shortLabel: "日记", icon: BookOpen },
      { to: "/student/coach", label: "教练", icon: MessagesSquare },
      { to: "/student/achievements", label: "能力档案", shortLabel: "档案", icon: Award }
    ]
  },
  {
    label: "行动",
    items: [
      { to: "/student/schedule", label: "日程", icon: CalendarDays },
      { to: "/student/challenges", label: "挑战", icon: Flag },
      { to: "/student/workbench", label: "本地工作台", shortLabel: "工位", icon: MonitorSmartphone }
    ]
  }
];

export const studentNavigationItems = studentNavigationGroups.flatMap((group) => group.items);

export const studentMobilePrimaryItems = [
  studentNavigationItems.find((item) => item.to === "/student/growth/timeline"),
  studentNavigationItems.find((item) => item.to === "/student/growth/journal"),
  studentNavigationItems.find((item) => item.to === "/student/coach"),
  studentNavigationItems.find((item) => item.to === "/student/challenges")
].filter((item): item is StudentNavigationItem => Boolean(item));

export const studentMobileMoreItems = studentNavigationItems.filter(
  (item) => !studentMobilePrimaryItems.some((primary) => primary.to === item.to)
);
