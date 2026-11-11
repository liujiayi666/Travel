import {
  useMutation,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  loginUser,
  logoutUser,
  registerUser,
} from "./requests";
import type {
  LoginInput,
  RegisterInput,
  User,
} from "./types";

export const useLoginUserMutation = <TContext = unknown>(
  options?: UseMutationOptions<
    User,
    Error,
    LoginInput,
    TContext
  >,
) =>
  useMutation({
    ...options,
    mutationFn: loginUser,
  });

export const useLogoutUserMutation = <TContext = unknown>(
  options?: UseMutationOptions<void, Error, void, TContext>,
) =>
  useMutation({
    ...options,
    mutationFn: logoutUser,
  });

export const useRegisterUserMutation = <TContext = unknown>(
  options?: UseMutationOptions<
    User,
    Error,
    RegisterInput,
    TContext
  >,
) =>
  useMutation({
    ...options,
    mutationFn: registerUser,
  });
