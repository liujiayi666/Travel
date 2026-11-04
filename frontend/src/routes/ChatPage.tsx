import { useAuth } from "@features/auth/AuthContext";
import { ChatSession } from "@features/chat/ChatSession";
import { resolveChatId } from "@features/chat/chats";
import { useModal } from "@shared/components/Modal/ModalContext";
import { useSearchParams } from "react-router";

export const ChatPage = () => {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const {
    actions: { open: openModal },
  } = useModal();
  const activeChatId = resolveChatId(searchParams.get("chat"));
  const currentUserId =
    auth.status === "authenticated" ? auth.user.id : null;

  const handlePrimaryAction = () => {
    if (auth.status === "anonymous") {
      openModal({ type: "auth" });
    }
  };

  return (
    <ChatSession
      key={`${currentUserId ?? "anonymous"}:${activeChatId}`}
      chatId={activeChatId}
      auth={auth}
      onAuthRequired={() => openModal({ type: "auth" })}
      onPrimaryAction={handlePrimaryAction}
    />
  );
};
