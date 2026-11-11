import { useMemo, useState, type ReactNode } from "react";

import {
  ModalContext,
  type ModalContextValue,
  type ModalScene,
} from "./ModalContext";

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider = ({ children }: ModalProviderProps) => {
  const [current, setCurrent] = useState<ModalScene | null>(null);

  const actions = useMemo<ModalContextValue["actions"]>(
    () => ({
      open: (scene) => setCurrent(scene),
      close: () => setCurrent(null),
    }),
    [],
  );

  const value = useMemo<ModalContextValue>(
    () => ({
      state: { current },
      actions,
    }),
    [actions, current],
  );

  return <ModalContext value={value}>{children}</ModalContext>;
};
