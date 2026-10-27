export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const httpRequest = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const headers = new Headers(options.headers);
  const response: Response = await fetch(url, {
    ...options,
    headers: headers,
  });

  if (!response.ok) {
    let message = `HTTP error: ${response.status}`;
    try {
      const jsonData = await response.json();
      const isStringDetail =
        jsonData.detail && typeof jsonData.detail == "string";
      message = isStringDetail ? jsonData.detail : message;
    } catch {
      throw new ApiError(response.status, message);
    }
    throw new ApiError(response.status, message);
  }

  return response;
};
