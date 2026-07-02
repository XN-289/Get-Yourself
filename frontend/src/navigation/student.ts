import {
  Award,
  BookOpen,
  CalendarDays,
  Compass,
  Flag,
  Heart,
  History,
  MessagesSquare,
  TicketCheck,
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
    label: "发现",
    items: [
      { to: "/student/events", label: "事件", icon: Compass },
      { to: "/student/follows", label: "关注", icon: Heart }
    ]
  },
  {
    label: "行动",
    items: [
      { to: "/student/reservations", label: "我的预约", shortLabel: "预约", icon: TicketCheck },
      { to: "/student/schedule", label: "日程", icon: CalendarDays },
      { to: "/student/challenges", label: "挑战", icon: Flag }
    ]
  }
];

export const studentNavigationItems = studentNavigationGroups.flatMap((group) => group.items);

export const studentMobilePrimaryItems = [
  studentNavigationItems.find((item) => item.to === "/student/growth/timeline"),
  studentNavigationItems.find((item) => item.to === "/student/growth/journal"),
  studentNavigationItems.find((item) => item.to === "/student/events"),
  studentNavigationItems.find((item) => item.to === "/student/challenges")
].filter((item): item is StudentNavigationItem => Boolean(item));

export const studentMobileMoreItems = studentNavigationItems.filter(
  (item) => !studentMobilePrimaryItems.some((primary) => primary.to === item.to)
);
