export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface JsonParser<T> {
  parse(input: unknown): T;
}

type JsonRequestOptions = Omit<RequestInit, "method" | "body">;

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

export const getJson = async <T>(
  url: string,
  schema: JsonParser<T>,
  options: JsonRequestOptions = {},
): Promise<T> => {
  const response = await httpRequest(url, {
    ...options,
    method: "GET",
  });

  return schema.parse(await response.json());
};

export const postJson = async <T>(
  url: string,
  body: unknown,
  schema: JsonParser<T>,
  options: JsonRequestOptions = {},
): Promise<T> => {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const response = await httpRequest(url, {
    ...options,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return schema.parse(await response.json());
};
