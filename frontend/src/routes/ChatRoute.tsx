import {
  useAuth,
  useAuthActions,
} from "@/components/auth";
import { ChatSession } from "@/components/chat";
import { isConversationId } from "@/components/chat/chats";
import { useModal } from "@/components/common/Modal";
import { useParams } from "react-router";

export const ChatRoute = () => {
  const auth = useAuth();
  const { expireSession } = useAuthActions();
  const { conversationId: routeConversationId } = useParams();
  const {
    actions: { open: openModal },
  } = useModal();

  const conversationId = routeConversationId ?? null;
  const invalidConversationId =
    routeConversationId !== undefined &&
    !isConversationId(routeConversationId);
  const currentUserId =
    auth.status === "authenticated" ? auth.user.id : null;

  const handleAuthRequired = async () => {
    if (auth.status === "authenticated") {
      await expireSession();
    }
    openModal({ type: "auth" });
  };

  return (
    <ChatSession
      key={`${currentUserId ?? "anonymous"}:${conversationId ?? "new"}`}
      conversationId={invalidConversationId ? null : conversationId}
      invalidConversationId={invalidConversationId}
      auth={auth}
      onAuthRequired={handleAuthRequired}
    />
  );
};
