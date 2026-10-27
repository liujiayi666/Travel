import { createContext, use } from "react";

export type ModalScene = {
  type: "auth";
};

export interface ModalContextValue {
  state: {
    current: ModalScene | null;
  };
  actions: {
    open: (scene: ModalScene) => void;
    close: () => void;
  };
}

export const ModalContext = createContext<ModalContextValue | null>(null);

export const useModal = () => {
  const context = use(ModalContext);
  if (context === null) {
    throw new Error("useModal must be used inside ModalProvider");
  }

  return context;
};
