import type { NavigationItem, RecentChat } from "./Sidebar";

export const navigation: readonly NavigationItem[] = [
  {
    id: "trip-planner",
    icon: "＋",
    label: "Trip planner",
    href: "/?section=trip-planner",
  },
  {
    id: "my-trips",
    icon: "▤",
    label: "My trips",
    href: "/?section=my-trips",
  },
  {
    id: "explore",
    icon: "◎",
    label: "Explore places",
    href: "/?section=explore",
  },
  {
    id: "saved-guides",
    icon: "▱",
    label: "Saved guides",
    href: "/?section=saved-guides",
  },
];

export const recentChats: readonly RecentChat[] = [
  {
    id: "kyoto",
    label: "Kyoto in five days",
    href: "/?section=trip-planner&chat=kyoto",
  },
  {
    id: "islands",
    label: "Bali or Phuket?",
    href: "/?section=trip-planner&chat=islands",
  },
];
