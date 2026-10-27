import { useAuth } from "@features/auth/AuthContext";
import { Section } from "@features/chat/Section";
import { useModal } from "@shared/components/Modal/ModalContext";

export const ChatPage = () => {
  const auth = useAuth();
  const {
    actions: { open: openModal },
  } = useModal();
  const isAuthenticated = auth.status === "authenticated";

  const handlePrimaryAction = () => {
    if (!isAuthenticated) {
      openModal({ type: "auth" });
    }
  };

  return (
    <Section
      auth={auth}
      primaryActionLabel={isAuthenticated ? "New trip" : "Sign in"}
      onPrimaryAction={handlePrimaryAction}
    />
  );
};
