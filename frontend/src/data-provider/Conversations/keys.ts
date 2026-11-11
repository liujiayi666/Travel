export const conversationKeys = {
  all: ["conversations"] as const,

  lists: (userId: string) => [...conversationKeys.all, userId, "list"] as const,

  messages: (userId: string, conversationId: string) =>
    [...conversationKeys.all, userId, "messages", conversationId] as const,
};
