# LLM Provider Rules

These rules apply to `backend/app/llm/` and supplement the root and backend `AGENTS.md` files.

## Provider boundary

- Application code depends on internal contracts in `contracts.py` (for example `LlmRequest`, `LlmResponse`, and `LlmProvider`), not vendor SDK request/response types.
- Vendor-specific SDK imports, payload conversion, response parsing, and exception translation belong inside the provider adapter.
- Keep provider construction/configuration in the existing dependency/runtime wiring. Do not create clients per request or hide global mutable clients in modules.
- Keep provider selection, model name, base URL, and credentials in backend configuration/environment variables. Never expose credentials to frontend code or logs.
- Preserve the OpenAI-compatible adapter design so DeepSeek remains the default and GLM can be selected through configuration.

## Request and response correctness

- Validate/normalize internal messages before crossing the SDK boundary. Do not silently drop unsupported roles or malformed content.
- Check that the upstream response contains a usable choice/message/content before returning an internal response.
- Do not leak raw vendor response objects or SDK-specific exceptions outside the adapter.
- Keep the internal response contract stable; add fields only when the application has a concrete need and tests cover the contract change.
- Do not add streaming or tool-call interfaces until the corresponding milestone explicitly introduces them. When they are introduced, normalize vendor events/tool calls into application-owned contracts.

## Failure handling and resource lifecycle

- Distinguish missing configuration, request timeout, upstream/API failure, and invalid internal application requests. Preserve the existing error taxonomy and HTTP mapping.
- Use bounded timeouts. Do not retry non-idempotent or potentially billable generation calls without an explicit policy.
- Ensure application-scoped SDK clients are closed in FastAPI lifespan, including shutdown after startup failures where applicable.
- Do not catch broad exceptions merely to return an empty answer or success-shaped response. Unexpected programming errors must remain observable without exposing internals to users.

## Review checklist

- Can business/service code run against a fake `LlmProvider` without importing the vendor SDK?
- Are provider-specific types and exceptions contained in the adapter?
- Are empty/malformed responses and timeout/upstream failures handled and tested?
- Are API keys and full sensitive prompts absent from logs and client responses?
- Does the change stay within the active milestone in `PROGRESS.md`?
