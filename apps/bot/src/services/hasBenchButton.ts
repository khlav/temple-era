import { ComponentType, type Message } from "discord.js";

/**
 * Returns true if the message carries a component (button) whose label contains "bench" —
 * Raid-Helper's signal that this is a signup post, not a roster-confirmation post (which only
 * ever carries Confirm/Cancel buttons).
 *
 * Ported from `apps/web/src/server/api/discord-helpers.ts`'s `hasBenchButton`, adapted to
 * discord.js's gateway `Message.components` shape rather than the REST API's raw JSON that the
 * web version was written against. Two differences from that port:
 *  - `Message.components` is a `TopLevelComponent[]` union (discord.js@14.27.0) where only the
 *    `ActionRow` variant carries a nested `.components` array — every other row type
 *    (`ContainerComponent`, `FileComponent`, etc.) does not, so rows are narrowed by
 *    `type === ComponentType.ActionRow` before being indexed.
 *  - `ButtonComponent.label` is a `string | null` getter on a class (not a plain-object field),
 *    reached the same way via the `in` operator's narrowing over the `MessageActionRowComponent`
 *    union.
 */
export function hasBenchButton(message: Message): boolean {
  for (const row of message.components) {
    if (row.type !== ComponentType.ActionRow) continue;

    for (const component of row.components) {
      const label = "label" in component ? component.label : undefined;
      if (label && label.toLowerCase().includes("bench")) return true;
    }
  }
  return false;
}
