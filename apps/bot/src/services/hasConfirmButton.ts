import { ComponentType, type Message } from "discord.js";

/**
 * Returns true if the message carries a component (button) whose label contains "confirm" —
 * Raid-Helper's signal that this is a roster/confirmation post (Confirm/Cancel buttons), posted
 * once signups for an event are locked in — distinct from a signup post's
 * Bench/Late/Tentative/Absence buttons (see `hasBenchButton`). Same narrowing rationale as
 * `hasBenchButton` (ActionRow-only rows carry a nested `.components` array; `label` is a
 * `string | null` class getter reached via the `in` operator).
 */
export function hasConfirmButton(message: Message): boolean {
  for (const row of message.components) {
    if (row.type !== ComponentType.ActionRow) continue;

    for (const component of row.components) {
      const label = "label" in component ? component.label : undefined;
      if (label && label.toLowerCase().includes("confirm")) return true;
    }
  }
  return false;
}
