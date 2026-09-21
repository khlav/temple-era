import { ComponentType, type Message } from "discord.js";
import { describe, expect, it } from "vitest";

import { hasConfirmButton } from "../hasConfirmButton.js";

/**
 * Minimal stand-in for a gateway Message: hasConfirmButton only touches `message.components`, so
 * faking the whole Discord.js object is unnecessary. Component rows/buttons are cast through
 * `unknown` rather than constructed via discord.js's classes (their constructors are private).
 */
function fakeMessage(components: unknown[]): Message {
  return { components } as unknown as Message;
}

function actionRow(buttons: Array<{ label?: string | null }>) {
  return {
    type: ComponentType.ActionRow,
    components: buttons.map((button) => ({ type: ComponentType.Button, ...button })),
  };
}

describe("hasConfirmButton", () => {
  it("classifies a roster confirmation post (a Confirm button present)", () => {
    const message = fakeMessage([actionRow([{ label: "Confirm" }, { label: "Cancel" }])]);
    expect(hasConfirmButton(message)).toBe(true);
  });

  it("matches the label case-insensitively", () => {
    const message = fakeMessage([actionRow([{ label: "CONFIRM" }])]);
    expect(hasConfirmButton(message)).toBe(true);
  });

  it("ignores a signup post (only Bench/Absence buttons)", () => {
    const message = fakeMessage([actionRow([{ label: "Bench" }, { label: "Absence" }])]);
    expect(hasConfirmButton(message)).toBe(false);
  });

  it("returns false for a message with no components at all", () => {
    const message = fakeMessage([]);
    expect(hasConfirmButton(message)).toBe(false);
  });

  it("returns false for a button with no label", () => {
    const message = fakeMessage([actionRow([{ label: null }])]);
    expect(hasConfirmButton(message)).toBe(false);
  });

  it("skips a non-ActionRow top-level component rather than throwing", () => {
    const message = fakeMessage([{ type: ComponentType.TextDisplay, content: "hello" }]);
    expect(hasConfirmButton(message)).toBe(false);
  });

  it("finds a Confirm button among multiple rows", () => {
    const message = fakeMessage([
      actionRow([{ label: "Bench" }]),
      actionRow([{ label: "Confirm" }, { label: "Cancel" }]),
    ]);
    expect(hasConfirmButton(message)).toBe(true);
  });
});
