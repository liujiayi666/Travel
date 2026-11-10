import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/shared/api/client";

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

export const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (
    error instanceof ApiError &&
    NON_RETRYABLE_STATUSES.has(error.status)
  ) {
    return false;
  }

  return failureCount < 1;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3000,
      retry: shouldRetry,
    },
  },
});
