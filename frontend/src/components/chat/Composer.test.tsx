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
          state={{ draft, phase: "ready", canStop: false }}
          actions={{ changeDraft: setDraft, submit, stop: vi.fn() }}
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

  it("submits with Enter and keeps Shift+Enter for a new line", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();

    const ComposerHarness = () => {
      const [draft, setDraft] = useState("A trip to Kyoto");

      return (
        <Composer
          state={{ draft, phase: "ready", canStop: false }}
          actions={{ changeDraft: setDraft, submit, stop: vi.fn() }}
        />
      );
    };

    render(<ComposerHarness />);
    const input = screen.getByLabelText("Describe your trip");

    await user.click(input);
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(submit).not.toHaveBeenCalled();
    expect(input).toHaveValue("A trip to Kyoto\n");

    await user.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith("A trip to Kyoto\n");
  });

  it("blocks submission while the session is unknown", () => {
    render(
      <Composer
        state={{ draft: "A trip to Kyoto", phase: "checking", canStop: false }}
        actions={{ changeDraft: vi.fn(), submit: vi.fn(), stop: vi.fn() }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Start planning" }),
    ).toBeDisabled();
  });

  it("blocks editing and submission while sending", () => {
    render(
      <Composer
        state={{ draft: "A trip to Kyoto", phase: "sending", canStop: false }}
        actions={{ changeDraft: vi.fn(), submit: vi.fn(), stop: vi.fn() }}
      />,
    );

    expect(screen.getByLabelText("Describe your trip")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Sending message" }),
    ).toBeDisabled();
  });

  it("stops an active generation without submitting the draft", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    const submit = vi.fn();

    render(
      <Composer
        state={{ draft: "A trip to Kyoto", phase: "sending", canStop: true }}
        actions={{ changeDraft: vi.fn(), submit, stop }}
      />,
    );

    expect(screen.getByLabelText("Describe your trip")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Stop generating" }));

    expect(stop).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
});
