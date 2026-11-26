import { lazy, Suspense } from "react";

import { useAuthActions } from "@/components/auth/AuthContext";
import { useModal } from "@/components/common/Modal/ModalContext";

const AuthModal = lazy(() =>
  import("@/components/auth/AuthModal").then((module) => ({
    default: module.AuthModal,
  })),
);

export const ModalOutlet = () => {
  const { state, actions } = useModal();
  const { login, register } = useAuthActions();
  const scene = state.current;

  if (scene?.type === "auth") {
    return (
      <Suspense fallback={null}>
        <AuthModal
          open
          onClose={actions.close}
          onLogin={login}
          onRegister={register}
        />
      </Suspense>
    );
  }

  return null;
};
