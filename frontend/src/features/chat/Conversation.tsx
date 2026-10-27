import type { AuthState } from "@features/auth/type";
import styles from "./Chat.module.css";

interface ConversationProps {
  auth: AuthState;
}

export const Conversation = ({ auth }: ConversationProps) => {
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
    </section>
  );
};
