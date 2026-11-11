import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  authKeys,
  type User,
} from "@/data-provider/Auth";
import { useChatRuntimeStore } from "@/store/chat";
import { useSessionLifecycleStore } from "@/store/session";

export interface IUseSessionTransition {
  begin: () => void;
  commit: (user: User | null) => void;
  abort: () => void;
}

export const useSessionTransition = (): IUseSessionTransition => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const disableQueries = useSessionLifecycleStore(
    (state) => state.disableQueries,
  );
  const enableQueries = useSessionLifecycleStore(
    (state) => state.enableQueries,
  );

  const begin = useCallback(() => {
    disableQueries();
    void queryClient.cancelQueries();
  }, [disableQueries, queryClient]);

  const commit = useCallback(
    (user: User | null) => {
      queryClient.removeQueries();
      useChatRuntimeStore.getState().clearAll();
      queryClient.setQueryData(
        authKeys.currentUser(),
        user,
      );
      navigate("/chat", { replace: true });
      enableQueries();
    },
    [enableQueries, navigate, queryClient],
  );

  const abort = useCallback(() => {
    enableQueries();
  }, [enableQueries]);

  return { begin, commit, abort };
};
