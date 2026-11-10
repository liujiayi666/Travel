import {
  useAuth,
  useAuthActions,
} from "@/components/auth";
import { ChatSession } from "@/components/chat";
import { isConversationId } from "@/components/chat/chats";
import { useModal } from "@/components/common/Modal";
import { Navigate, useParams } from "react-router";
import { useSessionTransition } from "@/hooks/session";

export const ChatRoute = () => {
  const auth = useAuth();
  const { expireSession } = useAuthActions();
  const { conversationId: routeConversationId } = useParams();
  const { resetConversationState } = useSessionTransition();
  const {
    actions: { open: openModal },
  } = useModal();

  const conversationId = routeConversationId ?? null;
  const currentUserId =
    auth.status === "authenticated" ? auth.user.id : null;

  if (
    routeConversationId !== undefined &&
    !isConversationId(routeConversationId)
  ) {
    return <Navigate to="/chat" replace />;
  }

  const handleAuthRequired = async () => {
    if (auth.status === "authenticated") {
      await expireSession();
    }
    openModal({ type: "auth" });
  };

  return (
    <ChatSession
      key={`${currentUserId ?? "anonymous"}:${conversationId ?? "new"}`}
      conversationId={conversationId}
      auth={auth}
      onAuthRequired={handleAuthRequired}
      onConversationUnavailable={() =>
        resetConversationState(conversationId)
      }
    />
  );
};
