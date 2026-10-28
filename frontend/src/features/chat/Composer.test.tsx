import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Composer } from "./Composer";

describe("Composer", () => {
  it("edits and submits the draft", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();

    const ComposerHarness = () => {
      const [draft, setDraft] = useState("A trip to Kyoto");

      return (
        <Composer
          state={{ draft, phase: "ready" }}
          actions={{ changeDraft: setDraft, submit }}
        />
      );
    };

    render(<ComposerHarness />);

    await user.type(screen.getByLabelText("Describe your trip"), "!");
    await user.click(screen.getByRole("button", { name: "Start planning" }));

    expect(screen.getByLabelText("Describe your trip")).toHaveValue(
      "A trip to Kyoto!",
    );
    expect(submit).toHaveBeenCalledOnce();
  });

  it("blocks submission while the session is unknown", () => {
    render(
      <Composer
        state={{ draft: "A trip to Kyoto", phase: "checking" }}
        actions={{ changeDraft: vi.fn(), submit: vi.fn() }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Start planning" }),
    ).toBeDisabled();
  });
});
