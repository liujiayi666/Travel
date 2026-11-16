import styles from "./Chat.module.css";

export type ComposerPhase = "ready" | "checking" | "sending" | "error";

export interface ComposerState {
  draft: string;
  phase: ComposerPhase;
  canStop: boolean;
}

export interface ComposerActions {
  changeDraft: (draft: string) => void;
  submit: (message: string) => void;
  stop: () => void;
}

interface ComposerProps {
  state: ComposerState;
  actions: ComposerActions;
}

export const Composer = ({ state, actions }: ComposerProps) => {
  const submitDisabled = state.phase !== "ready" || state.draft.trim().length === 0;

  return (
    <div className={styles.composerArea}>
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          actions.submit(state.draft);
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
          maxLength={4000}
          disabled={state.phase === "sending"}
          value={state.draft}
          onChange={(event) => actions.changeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }

            event.preventDefault();
            if (!submitDisabled) {
              actions.submit(state.draft);
            }
          }}
        />
        {state.canStop ? (
          <button type="button" aria-label="Stop generating" onClick={actions.stop}>
            ■
          </button>
        ) : (
          <button
            type="submit"
            aria-label={state.phase === "sending" ? "Sending message" : "Start planning"}
            disabled={submitDisabled}
          >
            ↑
          </button>
        )}
      </form>
      <p>Travel Copilot can make mistakes. Check important details.</p>
    </div>
  );
};
