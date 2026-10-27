import { useAuthActions } from "@features/auth/AuthContext";
import { AuthModal } from "@features/auth/components/AuthModal";
import { useModal } from "@shared/components/Modal/ModalContext";

export const ModalOutlet = () => {
  const { state, actions } = useModal();
  const { login, register } = useAuthActions();
  const scene = state.current;

  if (scene?.type === "auth") {
    return (
      <AuthModal
        open
        onClose={actions.close}
        onLogin={login}
        onRegister={register}
      />
    );
  }

  return null;
};
