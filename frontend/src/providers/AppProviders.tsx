import { Outlet } from "react-router";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { SessionChatDraftProvider } from "@/components/chat/draft";
import { ModalOutlet } from "@/components/common/Modal/ModalOutlet";
import { ModalProvider } from "@/components/common/Modal/ModalProvider";
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
