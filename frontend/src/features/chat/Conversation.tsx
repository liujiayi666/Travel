import type { AuthState } from "@features/auth/type";
import styles from "./Chat.module.css";
import type { ChatMessage } from "./type";

interface ConversationProps {
  auth: AuthState;
  messages?: readonly ChatMessage[];
  isSending?: boolean;
  sendError?: string | null;
}

export const Conversation = ({
  auth,
  messages = [],
  isSending = false,
  sendError = null,
}: ConversationProps) => {
  return (
    <section className={styles.conversation} aria-live="polite">
      <div className={styles.assistantMessage}>
        <span className={styles.assistantAvatar} aria-hidden="true">
          ✦
        </span>
        <div>
          <p>
            {auth.status === "authenticated"
              ? `Hi, ${auth.user.displayName}. Where are you thinking of going?`
              : "Where are you thinking of going?"}
          </p>
          <small>Planning is easier when you start with a feeling.</small>
        </div>
      </div>

      {auth.status === "checking" && (
        <p className={styles.status}>Restoring your session…</p>
      )}

      {auth.status === "error" && (
        <div className={styles.errorNotice} role="alert">
          <strong>We could not confirm your session.</strong>
          <span>{auth.message}</span>
        </div>
      )}

      {messages.map((message, index) => (
        <div
          key={`${message.role}-${index}`}
          className={
            message.role === "assistant"
              ? styles.assistantMessage
              : styles.userMessage
          }
        >
          <p>{message.content}</p>
        </div>
      ))}

      {isSending && (
        <p className={styles.status} role="status">
          Thinking…
        </p>
      )}

      {sendError && (
        <div className={styles.errorNotice} role="alert">
          <strong>We could not send your message.</strong>
          <span>{sendError}</span>
        </div>
      )}
    </section>
  );
};
