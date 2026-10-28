import styles from "./Chat.module.css";

export type ComposerPhase = "ready" | "checking" | "sending" | "error";

export interface ComposerState {
  draft: string;
  phase: ComposerPhase;
}

export interface ComposerActions {
  changeDraft: (draft: string) => void;
  submit: () => void;
}

interface ComposerProps {
  state: ComposerState;
  actions: ComposerActions;
}

export const Composer = ({ state, actions }: ComposerProps) => {
  const submitDisabled =
    state.phase !== "ready" || state.draft.trim().length === 0;

  return (
    <div className={styles.composerArea}>
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          actions.submit();
        }}
      >
        <button type="button" aria-label="Add context">
          +
        </button>
        <textarea
          rows={1}
          name="tripPrompt"
          aria-label="Describe your trip"
          placeholder="Planning your trip…"
          value={state.draft}
          onChange={(event) => actions.changeDraft(event.target.value)}
        />
        <button
          type="submit"
          aria-label="Start planning"
          disabled={submitDisabled}
        >
          ↑
        </button>
      </form>
      <p>Travel Copilot can make mistakes. Check important details.</p>
    </div>
  );
};
