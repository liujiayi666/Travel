import { useQuery } from "@tanstack/react-query";

import { useSessionLifecycleStore } from "@/store/session";
import { ApiError } from "@/shared/api/client";
import { getCurrentUser } from "./requests";
import type { User } from "./types";

export const authKeys = {
  all: ["auth"] as const,
  currentUser: () => [...authKeys.all, "me"] as const,
};

export const useCurrentUserQuery = () => {
  const queriesEnabled = useSessionLifecycleStore(
    (state) => state.queriesEnabled,
  );

  return useQuery({
    queryKey: authKeys.currentUser(),
    queryFn: async (): Promise<User | null> => {
      try {
        return await getCurrentUser();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    enabled: queriesEnabled,
  });
};
