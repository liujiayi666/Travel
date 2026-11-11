import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

describe("Modal", () => {
  it("exposes its accessible name", () => {
    render(
      <Modal open onClose={vi.fn()} ariaLabel="Account dialog">
        <p>Dialog content</p>
      </Modal>,
    );

    expect(
      screen.getByRole("dialog", { name: "Account dialog" }),
    ).toBeInTheDocument();
  });
});
