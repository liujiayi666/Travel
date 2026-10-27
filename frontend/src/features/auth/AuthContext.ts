import { createContext, use } from "react";

import type { AuthState, LoginInput, RegisterInput } from "./type";

export interface AuthActions {
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
}

export interface AuthContextValue {
  state: AuthState;
  actions: AuthActions;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const context = use(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context.state;
};

export const useAuthActions = () => {
  const context = use(AuthContext);
  if (context === null) {
    throw new Error("useAuthActions must be used inside AuthProvider");
  }

  return context.actions;
};
