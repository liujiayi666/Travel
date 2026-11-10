import type { AuthState } from "@/components/auth";
import type { ChatMessage } from "./types";
import { Composer, type ComposerActions, type ComposerState } from "./Composer";
import { Conversation } from "./Conversation";
import styles from "./Chat.module.css";

interface SectionProps {
  auth: AuthState;
  messages?: readonly ChatMessage[];
  isSending?: boolean;
  sendError?: string | null;
  errorTitle?: string;
  onRetry?: () => void;
  showWelcome?: boolean;
  composer: {
    state: ComposerState;
    actions: ComposerActions;
  };
}

export const Section = ({
  auth,
  messages = [],
  isSending = false,
  sendError = null,
  errorTitle,
  onRetry,
  showWelcome,
  composer,
}: SectionProps) => {
  return (
    <section className={styles.section}>
      <header className={styles.header}></header>

      <Conversation
        auth={auth}
        messages={messages}
        isSending={isSending}
        sendError={sendError}
        errorTitle={errorTitle}
        onRetry={onRetry}
        showWelcome={showWelcome}
      />
      <Composer state={composer.state} actions={composer.actions} />
    </section>
  );
};
