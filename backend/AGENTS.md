# Backend Engineering & Review Rules

These rules supplement the repository-root `AGENTS.md`. Follow `docs/architecture.md` and the active milestone in `PROGRESS.md`; do not implement future milestones just because they appear in the roadmap.

## Architecture boundaries

- Keep the modular-monolith structure. Do not introduce microservices, queues, Redis, or extra infrastructure without a measured requirement.
- Keep FastAPI route handlers thin: parse HTTP input, call the service/dependency layer, and translate application results/errors into HTTP responses.
- Put business rules in services. Keep SQLAlchemy access and query composition in the existing data-access/service conventions; do not add abstraction layers without a concrete reuse or testability benefit.
- Keep Pydantic request/response schemas separate from ORM models and internal domain/provider contracts.
- Reuse existing error types and error-handler patterns. Do not leak stack traces, SQL details, provider responses, or secrets to clients.

## FastAPI and async lifecycle

- Await asynchronous database, provider, and I/O operations. Do not block the event loop with synchronous network or filesystem work.
- Manage application-scoped clients/resources in lifespan and close them during shutdown. Manage request-scoped database sessions through dependencies; do not keep an AsyncSession globally.
- Ensure cancellation and exceptions still run cleanup. Avoid swallowing CancelledError or converting cancellation into an ordinary success.
- Set explicit timeouts for external calls. Retry only when the operation is safe/idempotent and the retry policy is bounded.
- Validate configuration at the boundary and fail clearly when required settings are missing.

## Database and SQLAlchemy

- Every query or mutation involving user-owned data must enforce ownership in the database predicate or an equivalent service-level authorization check; never rely on a prior frontend check.
- For conversation resources, scope access by both the resource identifier and authenticated user identifier. Preserve the project's non-disclosure behavior for inaccessible resources (404 where specified).
- Use the request's AsyncSession; do not create hidden sessions inside route handlers or share sessions across concurrent tasks.
- Make transaction boundaries explicit. Commit only at the intended unit-of-work boundary; rollback on failure when the session may otherwise remain in a failed transaction.
- Consider concurrent requests when enforcing uniqueness or state transitions. Database constraints are the final guard for uniqueness; translate expected integrity conflicts into stable application errors.
- Avoid N+1 queries and unbounded result loading when a concrete path can grow. Add indexes only for real lookup/constraint patterns and include migrations when schema changes.
- Do not edit an existing Alembic migration that may have been applied; create a new migration and inspect upgrade/downgrade behavior.

## API and security

- Treat all request fields as untrusted, including IDs, filenames, MIME types, URLs, and model/tool arguments.
- Derive the current user from the authenticated server-side session, never from a client-provided user_id.
- Preserve CSRF/Origin protections for state-changing browser requests and existing cookie security attributes.
- Keep API request/response contracts explicit and backward compatible unless a breaking change is intentional and documented.
- Map validation, authentication, authorization, internal, and upstream-provider failures to the correct existing HTTP error boundary; do not label internal bugs as upstream failures.
- Never log passwords, raw session tokens, cookies, API keys, full private documents, or complete sensitive prompts.

## Tests and validation

- Add or update pytest coverage for changed behavior. Prefer tests at the service/API boundary that prove observable behavior.
- Cover both success and relevant failure paths: unauthenticated access, cross-user access, invalid input, transaction failure, provider timeout/error, and cancellation where applicable.
- Use fake providers and isolated test databases for deterministic tests; never run tests against a production database.
- Respect the repository's test-environment safeguards and existing Ruff configuration (Python 3.12, line length 100, import sorting).
- Do not claim tests passed unless they were actually run; state any unrun integration checks and their dependencies.

## Review checklist

When reviewing backend diffs, inspect:
- authorization predicates on every user-owned read/write;
- transaction/flush/commit/rollback behavior and concurrent uniqueness;
- AsyncSession ownership and async resource cleanup;
- stable error-to-HTTP mapping and response schema compatibility;
- configuration and secret boundaries;
- migration reversibility and test coverage.

Prefer a minimal, backward-compatible correction over broad cleanup.
