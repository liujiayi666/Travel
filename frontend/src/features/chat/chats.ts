export interface ChatSummary {
  id: string;
  label: string;
  href: string;
}

export const defaultChatId = "kyoto";

export const recentChats: readonly ChatSummary[] = [
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

const knownChatIds = new Set(recentChats.map((chat) => chat.id));

export const resolveChatId = (requestedChatId: string | null) =>
  requestedChatId !== null && knownChatIds.has(requestedChatId)
    ? requestedChatId
    : defaultChatId;
