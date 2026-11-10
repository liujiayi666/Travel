import { useEffect, useEffectEvent, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import {
  useConversationMessages,
  conversationKeys,
  useCreateConversationMutation,
  useSendMessageMutation,
} from "@/data-provider/Conversations";
import {
  useChatRuntimeStore,
  type ChatRun,
} from "@/store/chat";
import { ApiError } from "@/shared/api/client";

const isActivePhase = (run: ChatRun) =>
  run.phase !== "failed";

const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.status === 404;

const getRuntimeErrorMessage = (
  error: unknown,
  fallback: string,
) => (error instanceof Error ? error.message : fallback);

const findRunForConversation = (
  runs: Record<string, ChatRun>,
  conversationId: string | null,
) => {
  const matchingRuns = Object.values(runs).filter(
    (run) => run.conversationId === conversationId,
  );

  return matchingRuns.find(isActivePhase) ?? matchingRuns.at(-1);
};

export const useChatRuntime = (
  userId: string | null,
  conversationId: string | null,
  onAuthRequired: () => void,
  onConversationUnavailable: () => void,
) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createMutation = useCreateConversationMutation();
  const sendMutation = useSendMessageMutation();
  const messagesQuery = useConversationMessages(userId, conversationId);
  const creatingRunIdRef = useRef<string | null>(null);

  const run = useChatRuntimeStore((state) =>
    userId
      ? findRunForConversation(state.runsById, conversationId)
      : undefined,
  );

  const startNewChat = async (content: string) => {
    const store = useChatRuntimeStore.getState();
    const existingRun = findRunForConversation(store.runsById, null);

    if (existingRun && isActivePhase(existingRun)) {
      return false;
    }

    let runId: string;

    if (
      existingRun?.phase === "failed" &&
      existingRun.content === content
    ) {
      store.retryFailed(existingRun.id);
      runId = existingRun.id;
    } else {
      runId = store.enqueueNewChat(content);
    }

    creatingRunIdRef.current = runId;

    try {
      const conversation = await createMutation.mutateAsync({
        message: content,
      });

      const bound = useChatRuntimeStore
        .getState()
        .bindConversation(runId, conversation.id);

      if (!bound) {
        return false;
      }

      creatingRunIdRef.current = null;
      void queryClient.invalidateQueries({
        queryKey: conversationKeys.lists(userId ?? "anonymous"),
      });
      navigate(`/chat/${conversation.id}`, { replace: true });
      return true;
    } catch (error) {
      creatingRunIdRef.current = null;
      const runStillExists = Boolean(
        useChatRuntimeStore.getState().runsById[runId],
      );

      if (!runStillExists) {
        return false;
      }

      if (isUnauthorized(error)) {
        useChatRuntimeStore
          .getState()
          .markFailed(runId, "Please sign in again.");
        onAuthRequired();
        return false;
      }

      if (isNotFound(error)) {
        onConversationUnavailable();
        return false;
      }

      useChatRuntimeStore
        .getState()
        .markFailed(
          runId,
          getRuntimeErrorMessage(error, "Failed to start a new chat."),
        );
      return false;
    }
  };

  const submitMessage = async (content: string) => {
    if (!conversationId) {
      return startNewChat(content);
    }

    const store = useChatRuntimeStore.getState();
    const existingRun = findRunForConversation(
      store.runsById,
      conversationId,
    );

    if (existingRun && isActivePhase(existingRun)) {
      return false;
    }

    if (
      existingRun?.phase === "failed" &&
      existingRun.content === content
    ) {
      store.retryFailed(existingRun.id);
      return true;
    }

    store.enqueueConversationMessage(conversationId, content);
    return true;
  };

  const synchronizePendingRun = async (pendingRun: ChatRun) => {
    if (!pendingRun.conversationId) {
      return;
    }

    const currentRun =
      useChatRuntimeStore.getState().runsById[pendingRun.id];
    if (
      !currentRun ||
      currentRun.phase !== "syncing-history"
    ) {
      return;
    }

    try {
      await queryClient.invalidateQueries(
        {
          queryKey: conversationKeys.messages(
            userId ?? "anonymous",
            pendingRun.conversationId,
          ),
        },
        { throwOnError: true },
      );
      void queryClient.invalidateQueries({
        queryKey: conversationKeys.lists(userId ?? "anonymous"),
      });
      useChatRuntimeStore.getState().removeRun(pendingRun.id);
    } catch (error) {
      const runStillExists = Boolean(
        useChatRuntimeStore.getState().runsById[pendingRun.id],
      );
      if (!runStillExists) {
        return;
      }

      const message = isUnauthorized(error)
        ? "Please sign in again."
        : getRuntimeErrorMessage(
            error,
            "The message was sent, but the conversation could not refresh.",
          );

      useChatRuntimeStore
        .getState()
        .markSyncFailed(pendingRun.id, message);

      if (isUnauthorized(error)) {
        onAuthRequired();
      } else if (isNotFound(error)) {
        onConversationUnavailable();
      }
    }
  };

  const sendPendingRun = useEffectEvent(async (pendingRun: ChatRun) => {
    if (!pendingRun.conversationId) {
      return;
    }

    try {
      await sendMutation.mutateAsync({
        conversationId: pendingRun.conversationId,
        payload: { content: pendingRun.content },
      });
    } catch (error) {
      if (isUnauthorized(error)) {
        useChatRuntimeStore
          .getState()
          .markFailed(pendingRun.id, "Please sign in again.");
        onAuthRequired();
        return;
      }

      if (isNotFound(error)) {
        onConversationUnavailable();
        return;
      }

      useChatRuntimeStore
        .getState()
        .markFailed(
          pendingRun.id,
          getRuntimeErrorMessage(error, "Failed to send your message."),
        );
      return;
    }

    const store = useChatRuntimeStore.getState();
    const currentRun = store.runsById[pendingRun.id];
    if (!currentRun || currentRun.phase !== "sending") {
      return;
    }

    store.markSyncing(pendingRun.id);
    await synchronizePendingRun(pendingRun);
  });

  useEffect(
    () => () => {
      const runId = creatingRunIdRef.current;
      if (!runId) {
        return;
      }

      useChatRuntimeStore.getState().removeRun(runId);
      creatingRunIdRef.current = null;
    },
    [],
  );

  const handleHistoryFailure = useEffectEvent((error: unknown) => {
    if (isUnauthorized(error)) {
      onAuthRequired();
      return;
    }

    if (isNotFound(error)) {
      onConversationUnavailable();
    }
  });

  useEffect(() => {
    if (messagesQuery.error) {
      handleHistoryFailure(messagesQuery.error);
    }
  }, [messagesQuery.error]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const store = useChatRuntimeStore.getState();
    const pendingRun = Object.values(store.runsById).find(
      (item) =>
        item.conversationId === conversationId &&
        item.phase === "awaiting-send",
    );

    if (!pendingRun || !store.claimForSending(pendingRun.id)) {
      return;
    }

    void sendPendingRun(pendingRun);
  }, [conversationId, run?.id, run?.phase]);

  return {
    run,
    messages: messagesQuery.data ?? [],
    historyPending:
      Boolean(userId && conversationId) && messagesQuery.isPending,
    historyError: messagesQuery.error,
    isBusy: Boolean(run && isActivePhase(run)),
    syncFailed: run?.phase === "sync-failed",
    isSending:
      run?.phase === "creating-conversation" ||
      run?.phase === "awaiting-send" ||
      run?.phase === "sending" ||
      run?.phase === "syncing-history",
    error:
      run?.phase === "failed" || run?.phase === "sync-failed"
        ? run.error
        : null,
    submitMessage,
    retrySync: () => {
      if (
        run?.phase === "sync-failed" &&
        useChatRuntimeStore.getState().beginSyncRetry(run.id)
      ) {
        void synchronizePendingRun(run);
      }
    },
  };
};
