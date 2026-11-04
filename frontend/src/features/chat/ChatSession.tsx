import type { AuthState } from "@features/auth/type";
import { sendMessage } from "@features/chat/api";
import { useChatDraft } from "@features/chat/ChatDraftContext";
import type { ChatMessage, ChatSendState } from "@features/chat/type";
import { useState } from "react";

import type { ComposerPhase } from "./Composer";
import { Section } from "./Section";

interface ChatSessionProps {
  chatId: string;
  auth: AuthState;
  onAuthRequired: () => void;
  onPrimaryAction: () => void;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";

export const ChatSession = ({
  chatId,
  auth,
  onAuthRequired,
  onPrimaryAction,
}: ChatSessionProps) => {
  const { draft, changeDraft } = useChatDraft(chatId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sendState, setSendState] = useState<ChatSendState>({
    status: "idle",
  });

  const composerPhase: ComposerPhase =
    auth.status === "checking"
      ? "checking"
      : auth.status === "error"
        ? "error"
        : sendState.status === "sending"
          ? "sending"
          : "ready";

  const submit = async (input: string) => {
    const content = input.trim();
    if (content.length === 0 || sendState.status === "sending") {
      return;
    }

    if (auth.status === "anonymous") {
      onAuthRequired();
      return;
    }

    if (auth.status !== "authenticated") {
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content,
    };

    setMessages([userMessage]);
    setSendState({ status: "sending" });
    changeDraft("");

    try {
      const result = await sendMessage({ message: content });
      if (result === null) {
        setMessages((current) => current.slice(0, -1));
        changeDraft(content);
        setSendState({ status: "idle" });
        onAuthRequired();
        return;
      }

      setMessages((current) => [
        ...current,
        {
          role: result.message.role,
          content: result.message.content,
        },
      ]);
      setSendState({ status: "idle" });
    } catch (error) {
      setMessages((current) => current.slice(0, -1));
      changeDraft(content);
      setSendState({
        status: "error",
        message: getErrorMessage(error),
      });
    }
  };

  return (
    <Section
      auth={auth}
      messages={messages}
      isSending={sendState.status === "sending"}
      sendError={sendState.status === "error" ? sendState.message : null}
      composer={{
        state: { draft, phase: composerPhase },
        actions: { changeDraft, submit },
      }}
      primaryActionLabel={
        auth.status === "authenticated" ? "New trip" : "Sign in"
      }
      onPrimaryAction={onPrimaryAction}
    />
  );
};
