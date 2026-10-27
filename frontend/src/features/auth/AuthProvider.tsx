import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from "./api";
import {
  AuthContext,
  type AuthActions,
  type AuthContextValue,
} from "./AuthContext";
import type { AuthState } from "./type";

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });

  const actions = useMemo<AuthActions>(
    () => ({
      login: async (input) => {
        const user = await loginUser(input);
        setAuth({ status: "authenticated", user });
      },
      logout: async () => {
        await logoutUser();
        setAuth({ status: "anonymous" });
      },
      register: async (input) => {
        const user = await registerUser(input);
        setAuth({ status: "authenticated", user });
      },
    }),
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state: auth,
      actions,
    }),
    [actions, auth],
  );

  useEffect(() => {
    const getUser = async () => {
      try {
        const user = await getCurrentUser();
        setAuth((current) =>
          current.status === "checking"
            ? user
              ? { status: "authenticated", user }
              : { status: "anonymous" }
            : current,
        );
      } catch (error) {
        setAuth((current) =>
          current.status === "checking"
            ? {
                status: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Unable to restore your session.",
              }
            : current,
        );
      }
    };
    void getUser();
  }, []);

  return <AuthContext value={value}>{children}</AuthContext>;
};
