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
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>(
    {},
  );
  const previousUserIdRef = useRef(currentUserId);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;

    // 匿名草稿需要跨登录保留；退出登录或切换账号时清理隐私数据。
    if (previousUserId !== null && previousUserId !== currentUserId) {
      setDraftsByChatId({});
    }

    previousUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const actions = useMemo<ChatDraftActions>(
    () => ({
      updateDraft: (chatId, draft) => {
        setDraftsByChatId((current) => {
          if (current[chatId] === draft) {
            return current;
          }

          return { ...current, [chatId]: draft };
        });
      },
      clearDraft: (chatId) => {
        setDraftsByChatId((current) => {
          if (!(chatId in current)) {
            return current;
          }

          const next = { ...current };
          delete next[chatId];
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
