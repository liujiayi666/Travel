import type { AuthState } from "@/components/auth";
import { useChatDraft } from "@/components/chat/draft";
import type { ChatMessage } from "./types";
import { useEffect, useEffectEvent, useRef } from "react";

import type { ComposerPhase } from "./Composer";
import { useChatRuntime } from "@/hooks/chat";
import { Section } from "./Section";

interface ChatSessionProps {
  conversationId: string | null;
  auth: AuthState;
  onAuthRequired: () => void;
  onConversationUnavailable: () => void;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";

export const ChatSession = ({
  conversationId,
  auth,
  onAuthRequired,
  onConversationUnavailable,
}: ChatSessionProps) => {
  const currentUserId =
    auth.status === "authenticated" ? auth.user.id : null;
  const { draft, changeDraft } = useChatDraft(
    conversationId ?? "new-chat",
  );
  const runtime = useChatRuntime(
    currentUserId,
    conversationId,
    onAuthRequired,
    onConversationUnavailable,
  );
  const restoredRunIdRef = useRef<string | null>(null);
  const failedRunId =
    runtime.run?.phase === "failed" ? runtime.run.id : null;
  const failedRunContent =
    runtime.run?.phase === "failed" ? runtime.run.content : null;

  const restoreDraft = useEffectEvent((content: string) => {
    changeDraft(content);
  });

  useEffect(() => {
    if (
      failedRunId === null ||
      failedRunContent === null ||
      restoredRunIdRef.current === failedRunId
    ) {
      return;
    }

    restoredRunIdRef.current = failedRunId;
    restoreDraft(failedRunContent);
  }, [failedRunContent, failedRunId]);

  const pendingMessages: ChatMessage[] =
    runtime.run && runtime.run.phase !== "syncing-history"
      ? [{ role: "user", content: runtime.run.content }]
      : [];
  const visibleMessages = [...runtime.messages, ...pendingMessages];
  const historyError = runtime.historyError
    ? getErrorMessage(runtime.historyError)
    : null;
  const sendError = runtime.error ?? historyError;
  const errorTitle = runtime.syncFailed
    ? "Your message was sent, but the conversation did not refresh."
    : runtime.error
      ? "We could not send your message."
      : "We could not load this conversation.";
  const showWelcome =
    conversationId === null &&
    visibleMessages.length === 0 &&
    !runtime.historyPending &&
    !sendError;

  const composerPhase: ComposerPhase =
    auth.status === "checking"
      ? "checking"
      : auth.status === "error"
        ? "error"
        : runtime.historyPending
          ? "checking"
          : runtime.syncFailed
            ? "error"
          : runtime.isSending
            ? "sending"
            : "ready";

  const submit = async (input: string) => {
    const content = input.trim();
    if (content.length === 0 || runtime.isBusy) {
      return;
    }

    if (auth.status === "anonymous") {
      onAuthRequired();
      return;
    }
    if (auth.status !== "authenticated") {
      return;
    }

    changeDraft("");

    try {
      const accepted = await runtime.submitMessage(content);

      if (!accepted) {
        changeDraft(content);
      }
    } catch {
      changeDraft(content);
    }
  };

  return (
    <Section
      auth={auth}
      messages={visibleMessages}
      isSending={runtime.isSending}
      sendError={sendError}
      errorTitle={errorTitle}
      onRetry={runtime.syncFailed ? runtime.retrySync : undefined}
      showWelcome={showWelcome}
      composer={{
        state: { draft, phase: composerPhase },
        actions: { changeDraft, submit },
      }}
    />
  );
};
