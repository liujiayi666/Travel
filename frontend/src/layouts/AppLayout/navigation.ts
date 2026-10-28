import type { NavigationItem } from "./Sidebar";
export { recentChats } from "@features/chat/chats";

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
