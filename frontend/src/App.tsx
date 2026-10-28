import { RouterProvider } from "react-router";
import { AuthProvider } from "@features/auth/AuthProvider";
import { SessionChatDraftProvider } from "@features/chat/ChatDraftProvider";
import { ModalOutlet } from "@app/modal/ModalOutlet";
import { router } from "@app/router";
import { ModalProvider } from "@shared/components/Modal/ModalProvider";

export default function App() {
  return (
    <AuthProvider>
      <SessionChatDraftProvider>
        <ModalProvider>
          <RouterProvider router={router} />
          <ModalOutlet />
        </ModalProvider>
      </SessionChatDraftProvider>
    </AuthProvider>
  );
}
