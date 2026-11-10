import { getJson, httpRequest, postJson } from "@/shared/api/client";
import { registerRequestSchema, userSchema } from "./schemas";
import type {
  LoginInput,
  RegisterInput,
  RegisterRequest,
  User,
} from "./types";

const baseUrl = "/api/auth";

export const getCurrentUser = async (): Promise<User> =>
  getJson(`${baseUrl}/me`, userSchema);

export const registerUser = async (input: RegisterInput): Promise<User> => {
  const payload: RegisterRequest = registerRequestSchema.parse(input);
  return postJson(`${baseUrl}/register`, payload, userSchema);
};

export const loginUser = async (input: LoginInput): Promise<User> => {
  return postJson(`${baseUrl}/login`, input, userSchema);
};

export const logoutUser = async (): Promise<void> => {
  await httpRequest(`${baseUrl}/logout`, {
    method: "POST",
  });
};
