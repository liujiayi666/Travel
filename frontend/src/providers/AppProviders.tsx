import { Outlet } from "react-router";

import { AuthProvider } from "@/components/auth";
import { SessionChatDraftProvider } from "@/components/chat/draft";
import { ModalOutlet, ModalProvider } from "@/components/common/Modal";
import { useSessionTransition } from "@/hooks/session";

export const AppProviders = () => {
  const sessionTransition = useSessionTransition();

  return (
    <AuthProvider sessionTransition={sessionTransition}>
      <SessionChatDraftProvider>
        <ModalProvider>
          <Outlet />
          <ModalOutlet />
        </ModalProvider>
      </SessionChatDraftProvider>
    </AuthProvider>
  );
};
