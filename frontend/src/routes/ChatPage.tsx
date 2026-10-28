import { useAuth } from "@features/auth/AuthContext";
import { useChatDraft } from "@features/chat/ChatDraftContext";
import type { ComposerPhase } from "@features/chat/Composer";
import { Section } from "@features/chat/Section";
import { useModal } from "@shared/components/Modal/ModalContext";
import { useSearchParams } from "react-router";

export const ChatPage = () => {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const {
    actions: { open: openModal },
  } = useModal();
  const activeChatId = searchParams.get("chat") ?? "kyoto";
  const { draft, changeDraft } = useChatDraft(activeChatId);
  const composerPhase: ComposerPhase =
    auth.status === "checking"
      ? "checking"
      : auth.status === "error"
        ? "error"
        : "ready";

  const handlePrimaryAction = () => {
    if (auth.status === "anonymous") {
      openModal({ type: "auth" });
    }
  };

  const submit = () => {
    if (draft.trim().length === 0) {
      return;
    }

    if (auth.status === "anonymous") {
      openModal({ type: "auth" });
      return;
    }

    if (auth.status !== "authenticated") {
      return;
    }

    // Chat API 将在 A7 接入；A5 只验证登录边界与草稿保留。
  };

  return (
    <Section
      auth={auth}
      composer={{
        state: { draft, phase: composerPhase },
        actions: { changeDraft, submit },
      }}
      primaryActionLabel={
        auth.status === "authenticated" ? "New trip" : "Sign in"
      }
      onPrimaryAction={handlePrimaryAction}
    />
  );
};
