import type { AuthState } from "@features/auth/type";
import type { ChatMessage } from "./type";
import {
  Composer,
  type ComposerActions,
  type ComposerState,
} from "./Composer";
import { Conversation } from "./Conversation";
import styles from "./Chat.module.css";

interface SectionProps {
  auth: AuthState;
  messages?: readonly ChatMessage[];
  isSending?: boolean;
  sendError?: string | null;
  composer: {
    state: ComposerState;
    actions: ComposerActions;
  };
  primaryActionLabel: string;
  onPrimaryAction: () => void;
}

export const Section = ({
  auth,
  messages = [],
  isSending = false,
  sendError = null,
  composer,
  primaryActionLabel,
  onPrimaryAction,
}: SectionProps) => {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <h1>New chat</h1>
          <p>Start with a place, mood, or budget</p>
        </div>
        <button
          type="button"
          className={styles.headerAction}
          onClick={onPrimaryAction}
        >
          {primaryActionLabel}
        </button>
      </header>

      <Conversation
        auth={auth}
        messages={messages}
        isSending={isSending}
        sendError={sendError}
      />
      <Composer state={composer.state} actions={composer.actions} />
    </section>
  );
};
