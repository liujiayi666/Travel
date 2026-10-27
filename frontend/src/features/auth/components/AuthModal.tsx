import { useId, useRef, useState, type FormEvent } from "react";

import { Modal } from "@shared/components/Modal/Modal";
import { loginInputSchema, registerInputSchema } from "../schemas";
import type { LoginInput, RegisterInput } from "../type";
import styles from "./AuthModal.module.css";

type AuthMode = "login" | "register";
type FieldErrors = Partial<
  Record<"displayName" | "email" | "password", string>
>;

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (input: LoginInput) => Promise<void>;
  onRegister: (input: RegisterInput) => Promise<void>;
}

const emptyLogin: LoginInput = {
  email: "",
  password: "",
};

const emptyRegister: RegisterInput = {
  displayName: "",
  email: "",
  password: "",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function collectFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): FieldErrors {
  return issues.reduce<FieldErrors>((errors, issue) => {
    const field = issue.path[0];
    if (
      field === "displayName" ||
      field === "email" ||
      field === "password"
    ) {
      errors[field] ??= issue.message;
    }
    return errors;
  }, {});
}

export function AuthModal({
  open,
  onClose,
  onLogin,
  onRegister,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginValues, setLoginValues] = useState<LoginInput>(emptyLogin);
  const [registerValues, setRegisterValues] =
    useState<RegisterInput>(emptyRegister);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const titleId = `${fieldId}-title`;
  const nameInputId = `${fieldId}-name`;
  const nameErrorId = `${fieldId}-name-error`;
  const emailInputId = `${fieldId}-email`;
  const emailHintId = `${fieldId}-email-hint`;
  const emailErrorId = `${fieldId}-email-error`;
  const passwordInputId = `${fieldId}-password`;
  const passwordHintId = `${fieldId}-password-hint`;
  const passwordErrorId = `${fieldId}-password-error`;

  const focusField = (field: PropertyKey | undefined) => {
    if (field === "displayName") displayNameRef.current?.focus();
    if (field === "email") emailRef.current?.focus();
    if (field === "password") passwordRef.current?.focus();
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFieldErrors({});
    setSubmitError("");
    setShowPassword(false);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    const result = loginInputSchema.safeParse(loginValues);
    if (!result.success) {
      setFieldErrors(collectFieldErrors(result.error.issues));
      focusField(result.error.issues[0]?.path[0]);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await onLogin(result.data);
      onClose();
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    const result = registerInputSchema.safeParse(registerValues);
    if (!result.success) {
      setFieldErrors(collectFieldErrors(result.error.issues));
      focusField(result.error.issues[0]?.path[0]);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await onRegister(result.data);
      onClose();
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLogin = mode === "login";
  const values = isLogin ? loginValues : registerValues;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="small"
      ariaLabelledBy={titleId}
    >
      <section className={styles.card}>
        <div className={styles.topRow}>
          <div className={styles.logo} aria-hidden="true">
            ✦
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close account dialog"
          >
            ×
          </button>
        </div>

        <div className={styles.heading}>
          <h2 id={titleId}>
            {isLogin ? "Welcome back" : "Create your account"}
          </h2>
          <p>
            {isLogin
              ? "Sign in to keep your trips synced and continue planning."
              : "Start planning trips and keep every conversation in one place."}
          </p>
        </div>

        <div className={styles.formSlot}>
          <form
            className={styles.form}
            onSubmit={isLogin ? handleLogin : handleRegister}
            noValidate
          >
            {!isLogin && (
              <div className={styles.field}>
                <label htmlFor={nameInputId}>Name</label>
                <input
                  id={nameInputId}
                  ref={displayNameRef}
                  name="displayName"
                  value={registerValues.displayName}
                  onChange={(event) =>
                    setRegisterValues({
                      ...registerValues,
                      displayName: event.target.value,
                    })
                  }
                  autoComplete="name"
                  placeholder="Jamie Lee"
                  aria-invalid={Boolean(fieldErrors.displayName)}
                  aria-describedby={
                    fieldErrors.displayName ? nameErrorId : undefined
                  }
                />
                {fieldErrors.displayName && (
                  <small
                    id={nameErrorId}
                    className={styles.fieldError}
                    aria-live="polite"
                  >
                    {fieldErrors.displayName}
                  </small>
                )}
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor={emailInputId}>Email address</label>
              <input
                id={emailInputId}
                ref={emailRef}
                name="email"
                type="email"
                value={values.email}
                onChange={(event) =>
                  isLogin
                    ? setLoginValues({
                        ...loginValues,
                        email: event.target.value,
                      })
                    : setRegisterValues({
                        ...registerValues,
                        email: event.target.value,
                      })
                }
                autoComplete="email"
                spellCheck={false}
                placeholder="jamie@example.com"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={
                  fieldErrors.email ? emailErrorId : emailHintId
                }
              />
              <small id={emailHintId} className={styles.hint}>
                Use the email linked to your account.
              </small>
              {fieldErrors.email && (
                <small
                  id={emailErrorId}
                  className={styles.fieldError}
                  aria-live="polite"
                >
                  {fieldErrors.email}
                </small>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor={passwordInputId}>Password</label>
              <div className={styles.passwordField}>
                <input
                  id={passwordInputId}
                  ref={passwordRef}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={values.password}
                  onChange={(event) =>
                    isLogin
                      ? setLoginValues({
                          ...loginValues,
                          password: event.target.value,
                        })
                      : setRegisterValues({
                          ...registerValues,
                          password: event.target.value,
                        })
                  }
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password ? passwordErrorId : passwordHintId
                  }
                />
                <button
                  type="button"
                  className={styles.revealPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="2.6" />
                    {showPassword && <path d="m4 4 16 16" />}
                  </svg>
                </button>
              </div>
              <small id={passwordHintId} className={styles.hint}>
                At least 8 characters.
              </small>
              {fieldErrors.password && (
                <small
                  id={passwordErrorId}
                  className={styles.fieldError}
                  aria-live="polite"
                >
                  {fieldErrors.password}
                </small>
              )}
            </div>

            {isLogin && (
              <div className={styles.supportRow}>
                <button
                  type="button"
                  className={styles.forgotButton}
                  onClick={() => setSubmitError("Password reset is coming soon.")}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {submitError && (
              <p className={styles.submitError} role="alert">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Please wait…"
                : isLogin
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>

        <p className={styles.modeFooter}>
          {isLogin
            ? "New to Travel Copilot?"
            : "Already have an account?"}
          <button
            type="button"
            className={styles.switchMode}
            onClick={() => switchMode(isLogin ? "register" : "login")}
          >
            {isLogin ? "Create an account" : "Sign in"}
          </button>
        </p>
      </section>
    </Modal>
  );
}
