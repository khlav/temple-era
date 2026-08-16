/**
 * Line-glyph stand-ins for professions — the repo has no profession art yet
 * (Pattern Spec / redesign handoff, rare-recipes screen note). Paths lifted from
 * the redesign hi-fi mockup's PROF_GLYPH map for the six professions it defines;
 * "Cooking" isn't in the mockup's recipe sample data but the schema allows it, so
 * it gets its own simple stand-in glyph (a pot) in the same stroke style.
 */
const PROFESSION_GLYPH_PATHS: Record<string, string> = {
  All: "M4 6h16M4 12h16M4 18h16",
  Alchemy: "M10 3h4M11 3v4.5L6.5 16A3.5 3.5 0 0 0 9.7 21h4.6a3.5 3.5 0 0 0 3.2-5L13 7.5V3M7.5 15h9",
  Tailoring: "M7 4v16M7 6h6a3 3 0 0 1 0 6H7M17 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  Leatherworking:
    "M12 3c4 0 7 2.7 7 6.5 0 2.4-1 4-1 6 0 3-2.5 5.5-6 5.5s-6-2.5-6-5.5c0-2-1-3.6-1-6C5 5.7 8 3 12 3ZM9 9h.01M15 9h.01",
  Enchanting:
    "M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 17l.9 2.2L21 20l-2.1.8L18 23l-.9-2.2L15 20l2.1-.8z",
  Engineering:
    "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.4-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.8 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4ZM15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  Blacksmithing: "M14 3h5l2 2-4 4-2-2M12.5 7.5 4 16v4h4l8.5-8.5M6 18h.01",
  Cooking:
    "M4 12h16M4 12a8 8 0 0 0 16 0M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M9 3c-1 1.2-1 2.3 0 3.5M14 3c-1 1.2-1 2.3 0 3.5",
};

export function ProfessionGlyph({
  profession,
  className,
  size = 17,
}: {
  profession: string;
  className?: string;
  size?: number;
}) {
  const d = PROFESSION_GLYPH_PATHS[profession];
  if (!d) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
