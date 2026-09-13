import { ComponentType, type Message } from "discord.js";
import { describe, expect, it } from "vitest";

import { hasBenchButton } from "../hasBenchButton.js";

/**
 * Minimal stand-in for a gateway Message: hasBenchButton only touches `message.components`, so
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

describe("hasBenchButton", () => {
  it("classifies a signup post (a Bench button present)", () => {
    const message = fakeMessage([actionRow([{ label: "Bench" }])]);
    expect(hasBenchButton(message)).toBe(true);
  });

  it("matches the label case-insensitively", () => {
    const message = fakeMessage([actionRow([{ label: "BENCH" }])]);
    expect(hasBenchButton(message)).toBe(true);
  });

  it("matches a label that merely contains bench", () => {
    const message = fakeMessage([actionRow([{ label: "Move to Bench" }])]);
    expect(hasBenchButton(message)).toBe(true);
  });

  it("ignores a roster confirmation post (only Confirm/Cancel buttons)", () => {
    const message = fakeMessage([actionRow([{ label: "Confirm" }, { label: "Cancel" }])]);
    expect(hasBenchButton(message)).toBe(false);
  });

  it("returns false for a message with no components at all", () => {
    const message = fakeMessage([]);
    expect(hasBenchButton(message)).toBe(false);
  });

  it("returns false for a button with no label", () => {
    const message = fakeMessage([actionRow([{ label: null }])]);
    expect(hasBenchButton(message)).toBe(false);
  });

  it("skips a non-ActionRow top-level component rather than throwing", () => {
    // e.g. a TextDisplayComponent (Components V2) — no nested `.components` array to index.
    const message = fakeMessage([{ type: ComponentType.TextDisplay, content: "hello" }]);
    expect(hasBenchButton(message)).toBe(false);
  });

  it("finds a Bench button among multiple rows", () => {
    const message = fakeMessage([
      actionRow([{ label: "Confirm" }, { label: "Cancel" }]),
      actionRow([{ label: "Bench" }]),
    ]);
    expect(hasBenchButton(message)).toBe(true);
  });
});
