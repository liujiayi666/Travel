import { useEffect, useEffectEvent, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import {
  useConversationMessages,
  conversationKeys,
  useCreateConversationMutation,
  type MessageStreamEvent,
  MessageStreamEventType,
} from "@/data-provider/Conversations";
import { useChatRuntimeStore, type ChatRun } from "@/store/chat";
import { ApiError } from "@/shared/api/client";
import { streamMessage } from "@/data-provider/Conversations/requests";
import {
  abortRunStream,
  createRunStreamController,
  releaseRunStreamController,
} from "./runStreamControllers";

const isActivePhase = (run: ChatRun) => run.phase !== "failed" && run.phase !== "cancelled";

const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

const getRuntimeErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const findRunForConversation = (runs: Record<string, ChatRun>, conversationId: string | null) => {
  const matchingRuns = Object.values(runs).filter((run) => run.conversationId === conversationId);

  return matchingRuns.find(isActivePhase) ?? matchingRuns.at(-1);
};

export type HistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; error: unknown };

export const useChatRuntime = (
  userId: string | null,
  conversationId: string | null,
  onAuthRequired: () => void,
) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createMutation = useCreateConversationMutation();
  const messagesQuery = useConversationMessages(userId, conversationId);
  const mountedRef = useRef(false);

  const run = useChatRuntimeStore((state) =>
    userId ? findRunForConversation(state.runsById, conversationId) : undefined,
  );

  const synchronizePendingRun = async (pendingRun: ChatRun) => {
    if (!pendingRun.conversationId) {
      return;
    }

    const currentRun = useChatRuntimeStore.getState().runsById[pendingRun.id];
    if (!currentRun || currentRun.phase !== "syncing-history") {
      return;
    }

    try {
      await queryClient.invalidateQueries(
        {
          queryKey: conversationKeys.messages(userId ?? "anonymous", pendingRun.conversationId),
        },
        { throwOnError: true },
      );
      void queryClient.invalidateQueries({
        queryKey: conversationKeys.lists(userId ?? "anonymous"),
      });
      useChatRuntimeStore.getState().removeRun(pendingRun.id);
    } catch (error) {
      const runStillExists = Boolean(useChatRuntimeStore.getState().runsById[pendingRun.id]);
      if (!runStillExists) {
        return;
      }

      const message = isUnauthorized(error)
        ? "Please sign in again."
        : getRuntimeErrorMessage(
            error,
            "The message was sent, but the conversation could not refresh.",
          );

      useChatRuntimeStore.getState().markSyncFailed(pendingRun.id, message);

      if (isUnauthorized(error)) {
        onAuthRequired();
      }
    }
  };

  const deliverPendingRun = async (pendingRun: ChatRun) => {
    if (!pendingRun.conversationId) {
      return;
    }
    let serverRunId: string | null = null;
    let terminalEvent: MessageStreamEvent | null = null;
    let streamError: unknown = null;
    const controller = createRunStreamController(pendingRun.id);

    try {
      for await (const event of streamMessage(
        {
          content: pendingRun.content,
        },
        pendingRun.conversationId,
        {
          signal: controller.signal,
        },
      )) {
        const store = useChatRuntimeStore.getState();
        const currentRun = store.runsById[pendingRun.id];
        if (!currentRun || currentRun.phase !== "sending") return;

        switch (event.type) {
          case MessageStreamEventType.RunStarted:
            if (event.conversationId !== pendingRun.conversationId) {
              store.markFailed(pendingRun.id, "The stream returned an unexpected conversation.");
              return;
            }

            serverRunId = event.runId;
            break;

          case MessageStreamEventType.TextDelta:
            if (serverRunId !== event.runId) {
              break;
            }

            store.appendStreamingText(pendingRun.id, event.delta);
            break;
          case MessageStreamEventType.RunCompleted:
            if (serverRunId !== event.runId) {
              return;
            }

            terminalEvent = event;
            break;
          case MessageStreamEventType.RunFailed:
            if (serverRunId !== event.runId) {
              return;
            }

            terminalEvent = event;
            store.markFailed(pendingRun.id, event.message);
            break;
        }

        if (terminalEvent !== null) {
          break;
        }
      }
    } catch (error) {
      streamError = error;
    } finally {
      releaseRunStreamController(pendingRun.id, controller);
    }

    const store = useChatRuntimeStore.getState();
    const currentRun = store.runsById[pendingRun.id];
    if (!currentRun || currentRun.phase !== "sending") {
      return;
    }

    if (terminalEvent?.type === MessageStreamEventType.RunCompleted) {
      if (serverRunId === null) {
        store.markFailed(pendingRun.id, "The response completed before streaming started.");
        return;
      }

      store.markSyncing(pendingRun.id);
      await synchronizePendingRun(pendingRun);
      return;
    }

    if (terminalEvent?.type === "run.failed") {
      return;
    }

    if (streamError !== null) {
      if (isUnauthorized(streamError)) {
        store.markFailed(pendingRun.id, "Please sign in again.");
        onAuthRequired();
        return;
      }

      if (isNotFound(streamError)) {
        store.markFailed(pendingRun.id, "This conversation is no longer available.");
        return;
      }

      store.markFailed(
        pendingRun.id,
        getRuntimeErrorMessage(streamError, "Failed to send your message."),
      );
      return;
    }

    store.markFailed(
      pendingRun.id,
      serverRunId === null
        ? "The response ended before streaming started."
        : "The response ended before completion.",
    );
  };

  const stop = () => {
    const currentRunId = run?.id;

    if (!currentRunId) {
      return;
    }

    const currentRun = useChatRuntimeStore.getState().runsById[currentRunId];

    if (!currentRun || currentRun.phase !== "sending") {
      return;
    }

    useChatRuntimeStore.getState().markCancelled(currentRunId);
    abortRunStream(currentRunId);
  };

  const sendPendingRun = useEffectEvent(deliverPendingRun);

  const startNewChat = async (content: string) => {
    const store = useChatRuntimeStore.getState();
    const existingRun = findRunForConversation(store.runsById, null);

    if (existingRun && isActivePhase(existingRun)) {
      return false;
    }

    let runId: string;

    if (existingRun?.phase === "failed" && existingRun.content === content) {
      store.retryFailed(existingRun.id);
      runId = existingRun.id;
    } else {
      runId = store.enqueueNewChat(content);
    }

    try {
      const conversation = await createMutation.mutateAsync({
        message: content,
      });

      const bound = useChatRuntimeStore.getState().bindConversation(runId, conversation.id);

      if (!bound) {
        return false;
      }

      void queryClient.invalidateQueries({
        queryKey: conversationKeys.lists(userId ?? "anonymous"),
      });

      if (mountedRef.current) {
        navigate(`/chat/${conversation.id}`, { replace: true });
        return true;
      }

      const pendingRun = useChatRuntimeStore.getState().runsById[runId];
      if (pendingRun && useChatRuntimeStore.getState().claimForSending(runId)) {
        const sendingRun = useChatRuntimeStore.getState().runsById[runId];
        if (sendingRun) {
          await deliverPendingRun(sendingRun);
        }
      }
      return true;
    } catch (error) {
      const runStillExists = Boolean(useChatRuntimeStore.getState().runsById[runId]);

      if (!runStillExists) {
        return false;
      }

      if (isUnauthorized(error)) {
        useChatRuntimeStore.getState().markFailed(runId, "Please sign in again.");
        onAuthRequired();
        return false;
      }

      if (isNotFound(error)) {
        useChatRuntimeStore
          .getState()
          .markFailed(runId, "This conversation is no longer available.");
        return false;
      }

      useChatRuntimeStore
        .getState()
        .markFailed(runId, getRuntimeErrorMessage(error, "Failed to start a new chat."));
      return false;
    }
  };

  const submitMessage = async (content: string) => {
    if (!conversationId) {
      return startNewChat(content);
    }

    const store = useChatRuntimeStore.getState();
    const existingRun = findRunForConversation(store.runsById, conversationId);

    if (existingRun && isActivePhase(existingRun)) {
      return false;
    }

    if (existingRun?.phase === "failed" && existingRun.content === content) {
      store.retryFailed(existingRun.id);
      return true;
    }

    store.enqueueConversationMessage(conversationId, content);
    return true;
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleHistoryFailure = useEffectEvent((error: unknown) => {
    if (isUnauthorized(error)) {
      onAuthRequired();
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
      (item) => item.conversationId === conversationId && item.phase === "awaiting-send",
    );

    if (!pendingRun || !store.claimForSending(pendingRun.id)) {
      return;
    }

    void sendPendingRun(pendingRun);
  }, [conversationId, run?.id, run?.phase]);

  return {
    run,
    messages: [...(messagesQuery.data?.pages ?? [])].reverse().flat(),
    historyState: (!userId || !conversationId
      ? { status: "idle" }
      : messagesQuery.isPending
        ? { status: "loading" }
        : messagesQuery.isError
          ? { status: "error", error: messagesQuery.error }
          : { status: "ready" }) satisfies HistoryState,
    retryHistory: messagesQuery.refetch,
    hasOlderMessages: messagesQuery.hasNextPage,
    isLoadingOlderMessages: messagesQuery.isFetchingNextPage,
    loadOlderMessages: messagesQuery.fetchNextPage,
    isBusy: Boolean(run && isActivePhase(run)),
    syncFailed: run?.phase === "sync-failed",
    isSending:
      run?.phase === "creating-conversation" ||
      run?.phase === "awaiting-send" ||
      run?.phase === "sending" ||
      run?.phase === "syncing-history",
    error: run?.phase === "failed" || run?.phase === "sync-failed" ? run.error : null,
    submitMessage,
    stop,
    streamingText: run?.streamingText ?? "",
    retrySync: () => {
      if (run?.phase === "sync-failed" && useChatRuntimeStore.getState().beginSyncRetry(run.id)) {
        void synchronizePendingRun(run);
      }
    },
  };
};
