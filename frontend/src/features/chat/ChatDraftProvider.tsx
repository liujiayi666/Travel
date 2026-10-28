import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@features/auth/AuthContext";
import {
  ChatDraftContext,
  type ChatDraftActions,
  type ChatDraftContextValue,
} from "./ChatDraftContext";

interface ChatDraftProviderProps {
  currentUserId: string | null;
  children: ReactNode;
}

export const ChatDraftProvider = ({
  currentUserId,
  children,
}: ChatDraftProviderProps) => {
  const [draftsByChatId, setDraftsByChatId] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const previousUserIdRef = useRef(currentUserId);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;

    // 匿名草稿需要跨登录保留；退出登录或切换账号时清理隐私数据。
    if (previousUserId !== null && previousUserId !== currentUserId) {
      setDraftsByChatId(new Map());
    }

    previousUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const actions = useMemo<ChatDraftActions>(
    () => ({
      updateDraft: (chatId, draft) => {
        setDraftsByChatId((current) => {
          if (current.get(chatId) === draft) {
            return current;
          }

          const next = new Map(current);
          next.set(chatId, draft);
          return next;
        });
      },
      clearDraft: (chatId) => {
        setDraftsByChatId((current) => {
          if (!current.has(chatId)) {
            return current;
          }

          const next = new Map(current);
          next.delete(chatId);
          return next;
        });
      },
    }),
    [],
  );

  const value = useMemo<ChatDraftContextValue>(
    () => ({
      state: { draftsByChatId },
      actions,
    }),
    [actions, draftsByChatId],
  );

  return <ChatDraftContext value={value}>{children}</ChatDraftContext>;
};

interface SessionChatDraftProviderProps {
  children: ReactNode;
}

export const SessionChatDraftProvider = ({
  children,
}: SessionChatDraftProviderProps) => {
  const auth = useAuth();
  const currentUserId = auth.status === "authenticated" ? auth.user.id : null;

  return (
    <ChatDraftProvider currentUserId={currentUserId}>
      {children}
    </ChatDraftProvider>
  );
};
