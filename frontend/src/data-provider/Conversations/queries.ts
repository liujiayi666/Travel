import { useQuery } from "@tanstack/react-query";
import {
  getConversationList,
  getConversationMessageList,
} from "./requests";
import { conversationKeys } from "./keys";
import { useSessionLifecycleStore } from "@/store/session";

export const useConversationList = (userId: string | null) => {
  const queriesEnabled = useSessionLifecycleStore(
    (state) => state.queriesEnabled,
  );

  return useQuery({
    queryKey: conversationKeys.lists(userId ?? "anonymous"),
    queryFn: () => getConversationList(),
    enabled: queriesEnabled && !!userId,
  });
};

export const useConversationMessages = (
  userId: string | null,
  conversationId: string | null,
) => {
  const queriesEnabled = useSessionLifecycleStore(
    (state) => state.queriesEnabled,
  );

  return useQuery({
    queryKey: conversationKeys.messages(
      userId ?? "anonymous",
      conversationId ?? "new",
    ),
    queryFn: () => getConversationMessageList(conversationId!),
    enabled:
      queriesEnabled && Boolean(userId && conversationId),
  });
};
