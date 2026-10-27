import type { AuthState } from "@features/auth/type";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import styles from "./Chat.module.css";

interface SectionProps {
  auth: AuthState;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
}

export const Section = ({
  auth,
  primaryActionLabel,
  onPrimaryAction,
}: SectionProps) => {
  const isAuthenticated = auth.status === "authenticated";

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

      <Conversation auth={auth} />
      <Composer isAuthenticated={isAuthenticated} />
    </section>
  );
};
