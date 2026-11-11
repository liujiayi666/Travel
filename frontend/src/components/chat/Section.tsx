import type { AuthState } from "@/components/auth";
import type { ChatMessage } from "./types";
import { Composer, type ComposerActions, type ComposerState } from "./Composer";
import { Conversation } from "./Conversation";
import styles from "./Chat.module.css";

interface SectionProps {
  auth: AuthState;
  messages?: readonly ChatMessage[];
  hasOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
  isSending?: boolean;
  sendError?: string | null;
  errorTitle?: string;
  onRetry?: () => void;
  historyError?: boolean;
  onRetryHistory?: () => void;
  showWelcome?: boolean;
  composer: {
    state: ComposerState;
    actions: ComposerActions;
  };
}

export const Section = ({
  auth,
  messages = [],
  hasOlderMessages,
  isLoadingOlderMessages,
  onLoadOlderMessages,
  isSending = false,
  sendError = null,
  errorTitle,
  onRetry,
  historyError = false,
  onRetryHistory,
  showWelcome,
  composer,
}: SectionProps) => {
  return (
    <section className={styles.section}>
      <header className={styles.header}></header>

      <Conversation
        auth={auth}
        messages={messages}
        hasOlderMessages={hasOlderMessages}
        isLoadingOlderMessages={isLoadingOlderMessages}
        onLoadOlderMessages={onLoadOlderMessages}
        isSending={isSending}
        sendError={sendError}
        errorTitle={errorTitle}
        onRetry={onRetry}
        historyError={historyError}
        onRetryHistory={onRetryHistory}
        showWelcome={showWelcome}
      />
      <Composer state={composer.state} actions={composer.actions} />
    </section>
  );
};
