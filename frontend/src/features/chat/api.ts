import { ApiError, httpRequest } from "@/shared/api/client";
import { chatResponseSchema } from "./schemas";
import type { ChatRequest, ChatResponse } from "./type";

export const sendMessage = async (
  payload: ChatRequest,
): Promise<ChatResponse | null> => {
  try {
    const response = await httpRequest("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const jsonData = await response.json();
    return chatResponseSchema.parse(jsonData);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
      // 401 被转换成 null，由页面转换成登录提示。
    }
    // 网络错误、5xx 和响应校验失败都继续向上抛，由页面显示发送错误。
    throw error;
  }
};
