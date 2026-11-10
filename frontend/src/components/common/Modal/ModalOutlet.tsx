import { AuthModal, useAuthActions } from "@/components/auth";
import { useModal } from "@/components/common/Modal";

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
