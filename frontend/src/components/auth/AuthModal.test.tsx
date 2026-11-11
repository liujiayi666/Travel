import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthModal } from "./AuthModal";

describe("AuthModal", () => {
  it("focuses the first invalid field", async () => {
    const user = userEvent.setup();

    render(
      <AuthModal
        open
        onClose={vi.fn()}
        onLogin={vi.fn()}
        onRegister={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      screen.getByLabelText("Email address", { selector: "input" }),
    ).toHaveFocus();
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });

  it("submits valid credentials", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <AuthModal
        open
        onClose={onClose}
        onLogin={onLogin}
        onRegister={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText("Email address", { selector: "input" }),
      "jamie@example.com",
    );
    await user.type(
      screen.getByLabelText("Password", { selector: "input" }),
      "password123",
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onLogin).toHaveBeenCalledWith({
      email: "jamie@example.com",
      password: "password123",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
