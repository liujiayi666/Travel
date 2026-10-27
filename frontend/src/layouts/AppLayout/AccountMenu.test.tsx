import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "./AccountMenu";

const account = {
  name: "Jamie Lee",
  detail: "jamie@example.com",
  initials: "J",
};

describe("AccountMenu", () => {
  it("opens the popover and selects an action", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <AccountMenu
        account={account}
        items={[{ id: "sign-out", label: "Sign out", onSelect }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();
  });

  it("closes with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();

    render(
      <AccountMenu
        account={account}
        items={[{ id: "sign-out", label: "Sign out", onSelect: vi.fn() }]}
      />,
    );

    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
