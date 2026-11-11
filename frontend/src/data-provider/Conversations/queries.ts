import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getConversationList, getConversationMessageList } from "./requests";
import { conversationKeys } from "./keys";
import { useSessionLifecycleStore } from "@/store/session";

const MESSAGE_PAGE_SIZE = 20;

export const useConversationList = (userId: string | null) => {
  const queriesEnabled = useSessionLifecycleStore((state) => state.queriesEnabled);

  return useQuery({
    queryKey: conversationKeys.lists(userId ?? "anonymous"),
    queryFn: () => getConversationList(),
    enabled: queriesEnabled && !!userId,
  });
};

export const useConversationMessages = (userId: string | null, conversationId: string | null) => {
  const queriesEnabled = useSessionLifecycleStore((state) => state.queriesEnabled);

  return useInfiniteQuery({
    queryKey: conversationKeys.messages(userId ?? "anonymous", conversationId ?? "new"),
    queryFn: ({ pageParam }) =>
      getConversationMessageList(conversationId!, {
        limit: MESSAGE_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return lastPage.length === MESSAGE_PAGE_SIZE ? lastPageParam + MESSAGE_PAGE_SIZE : undefined;
    },
    enabled: queriesEnabled && Boolean(userId && conversationId),
  });
};
