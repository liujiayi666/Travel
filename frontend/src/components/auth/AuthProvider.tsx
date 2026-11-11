import { useMemo, type ReactNode } from "react";

import {
  useCurrentUserQuery,
  useLoginUserMutation,
  useLogoutUserMutation,
  useRegisterUserMutation,
} from "@/data-provider/Auth";
import type { IUseSessionTransition } from "@/hooks/session/useSessionTransition";
import { ApiError } from "@/shared/api/client";
import {
  AuthContext,
  type AuthActions,
  type AuthContextValue,
} from "./AuthContext";
import type { AuthState } from "./types";

interface AuthProviderProps {
  children: ReactNode;
  sessionTransition: IUseSessionTransition;
}

const restoreAuthState = (error: unknown): AuthState => {
  if (error instanceof ApiError && error.status === 401) {
    return { status: "anonymous" };
  }

  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to restore your session.",
  };
};

export const AuthProvider = ({
  children,
  sessionTransition,
}: AuthProviderProps) => {
  const currentUserQuery = useCurrentUserQuery();
  const { abort, begin, commit } = sessionTransition;

  const loginMutation = useLoginUserMutation({
    onMutate: begin,
    onSuccess: (user) => {
      commit(user);
    },
    onError: abort,
  });

  const logoutMutation = useLogoutUserMutation({
    onMutate: begin,
    onSuccess: () => {
      commit(null);
    },
    onError: abort,
  });

  const registerMutation = useRegisterUserMutation({
    onMutate: begin,
    onSuccess: (user) => {
      commit(user);
    },
    onError: abort,
  });

  const auth = useMemo<AuthState>(() => {
    if (currentUserQuery.isPending) {
      return { status: "checking" };
    }

    if (currentUserQuery.isError) {
      return restoreAuthState(currentUserQuery.error);
    }

    return currentUserQuery.data
      ? {
          status: "authenticated",
          user: currentUserQuery.data,
        }
      : { status: "anonymous" };
  }, [
    currentUserQuery.data,
    currentUserQuery.error,
    currentUserQuery.isError,
    currentUserQuery.isPending,
  ]);

  const actions = useMemo<AuthActions>(
    () => ({
      expireSession: async () => {
        begin();
        commit(null);
      },
      login: async (input) => {
        await loginMutation.mutateAsync(input);
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      register: async (input) => {
        await registerMutation.mutateAsync(input);
      },
    }),
    [begin, commit, loginMutation, logoutMutation, registerMutation],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state: auth,
      actions,
    }),
    [actions, auth],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
};
