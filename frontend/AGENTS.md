# Frontend Engineering & Review Rules

These rules supplement the repository-root `AGENTS.md`. Follow the current architecture and milestone; do not add libraries or future-phase features without a concrete need.

## Architecture and state

- Use React 19 and TypeScript strict typing. Keep components focused and props/contracts explicit.
- Components consume the application's own HTTP/API contracts. Never call an LLM provider directly from the browser or expose provider credentials.
- Keep transport and API error normalization in the shared API layer; feature components should not duplicate fetch/error parsing.
- Keep local interaction state local (`useState` / `useReducer`). Introduce server-state libraries or global stores only when the documented architecture and a real use case justify them.
- Do not mirror the same server data in multiple competing state stores.
- Use stable resource IDs for conversation/message identity. Avoid array indexes as keys for mutable message lists.
- Preserve per-conversation draft isolation and the existing authentication state semantics.

## Async UI and routing

- Handle loading, empty, success, and error states explicitly where the user can observe them.
- Prevent stale async responses from overwriting newer route/resource state. Clean up subscriptions, readers, and abort controllers on unmount or request replacement.
- Disable or guard duplicate submissions while a request is in flight when duplicate writes would be harmful.
- Keep route transitions consistent with the server-created resource ID; do not invent temporary IDs that can be mistaken for persisted resources.
- Do not treat an authentication lookup failure as an anonymous session. Preserve the distinction between checking, authenticated, anonymous, and error states where implemented.

## Type and API boundaries

- Validate untrusted API responses at the boundary where the project uses Zod; TypeScript types alone do not validate runtime data.
- Keep frontend request/response types aligned with FastAPI schemas. Do not send client-owned user identity, provider selection, system prompts, or authoritative conversation history.
- Handle non-2xx responses consistently and preserve useful safe error details without displaying raw server internals.
- Avoid `any`, unsafe casts, and non-null assertions unless the invariant is established and documented.
- Keep URL parameters and dynamic object keys validated; do not assume arbitrary strings are safe identifiers or dictionary keys.

## Accessibility and UX

- Interactive controls need accessible names, keyboard operation, and appropriate disabled/loading feedback.
- Preserve focus behavior for dialogs and forms. Do not use color alone to communicate status.
- Avoid unnecessary rerenders or per-token full-tree updates in streaming work; follow the buffering strategy in the architecture when SSE is implemented.

## Tests and validation

- Add/update Vitest and React Testing Library tests for changed behavior, especially state transitions and async races.
- Test meaningful error/loading/empty states and authentication boundaries, not only the happy path.
- Run the repository's actual scripts: `npm test`, `npm run lint`, and `npm run build` from `frontend/` as relevant.
- Do not claim checks passed unless they were run. Keep tests deterministic and avoid depending on live provider/network calls.

## Review checklist

- Do UI state transitions remain correct when navigating quickly or when requests finish out of order?
- Are auth and conversation ownership assumptions enforced by the backend rather than trusted from the UI?
- Do API types and runtime validation match the server contract?
- Are effects, subscriptions, abort controllers, and event readers cleaned up?
- Are accessibility and existing user workflows preserved?
