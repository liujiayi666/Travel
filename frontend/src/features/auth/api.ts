import { ApiError, httpRequest } from "@/shared/api/client";
import { registerRequestSchema, userSchema } from "./schemas";
import type { LoginInput, RegisterInput, RegisterRequest, User } from "./type";

const baseUrl = "/api/auth";

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const response = await httpRequest(`${baseUrl}/me`, {
      method: "GET",
    });

    const jsonData = await response.json();
    return userSchema.parse(jsonData);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
      // 401 被转换成 null，表示当前没有登录
    }
    // 网络错误、500、Zod 校验失败都继续向上抛，交给 AuthProvider 显示认证错误
    throw error;
  }
};

export const registerUser = async (input: RegisterInput): Promise<User> => {
  const payload: RegisterRequest = registerRequestSchema.parse(input);
  const response = await httpRequest(`${baseUrl}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return userSchema.parse(await response.json());
};

export const loginUser = async (input: LoginInput): Promise<User> => {
  const response = await httpRequest(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return userSchema.parse(await response.json());
};

export const logoutUser = async (): Promise<void> => {
  await httpRequest(`${baseUrl}/logout`, {
    method: "POST",
  });
};
