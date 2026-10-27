import styles from "./Chat.module.css";

interface ComposerProps {
  isAuthenticated: boolean;
}

export const Composer = ({ isAuthenticated }: ComposerProps) => {
  return (
    <div className={styles.composerArea}>
      <form
        className={styles.composer}
        onSubmit={(event) => event.preventDefault()}
      >
        <button type="button" aria-label="Add context">
          +
        </button>
        <textarea
          rows={1}
          name="tripPrompt"
          aria-label="Describe your trip"
          placeholder="Planning your trip…"
          disabled={!isAuthenticated}
        />
        <button type="submit" aria-label="Start planning">
          ↑
        </button>
      </form>
      <p>Travel Copilot can make mistakes. Check important details.</p>
    </div>
  );
};
