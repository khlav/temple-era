import type { AchievementRuleConfig } from "~/server/db/schema";

// number[] accommodates recipe_set_threshold's `recipeSpellIds` field, spread in wholesale below
// alongside every other shape's scalar fields — it's never referenced by `{...}` in a template
// (only `{minCount}` is), so its exact stringified form if it ever were doesn't matter.
type TemplateVars = Record<string, string | number | number[] | undefined>;

// `{?key}...{/key}` conditional block, `{key:suffix}` pluralization, `{key}` plain substitution —
// see achievement-definitions.ts's header comment for the full syntax this mirrors.
const CONDITIONAL_RE = /\{\?(\w+)\}([\s\S]*?)\{\/\1\}/g;
const PLURAL_RE = /\{(\w+):(\w+)\}/g;
const VAR_RE = /\{(\w+)\}/g;

function substitute(template: string, vars: TemplateVars): string {
  let out = template.replace(PLURAL_RE, (_match, key: string, suffix: string) => {
    const value = vars[key];
    return typeof value === "number" && value === 1 ? "" : suffix;
  });
  out = out.replace(VAR_RE, (_match, key: string) => {
    const value = vars[key];
    return value === undefined ? "" : String(value);
  });
  return out;
}

function windowPhrase(scope: "season" | "all_time", lockoutWeeks: number | undefined): string {
  if (typeof lockoutWeeks === "number") {
    return `over the last ${lockoutWeeks} week${lockoutWeeks === 1 ? "" : "s"}`;
  }
  return scope === "all_time" ? "of all time" : "this season";
}

/** Resolves an achievement's raw description template against the specific tier actually earned
 *  — a Copper vs Thorium award of the same achievement reads different numbers. Manual (non-rule)
 *  achievements have no ruleConfig and no template syntax in practice, so they pass through
 *  unchanged. Null/empty template resolves to "" so callers can just check truthiness. */
export function resolveAchievementDescription(
  template: string | null,
  ruleConfig: AchievementRuleConfig | null,
  scope: "season" | "all_time",
): string {
  if (!template) return "";
  if (!ruleConfig) return template;

  const vars: TemplateVars = {
    ...ruleConfig,
    window: windowPhrase(scope, ruleConfig.lockoutWeeks),
  };
  // `class` ("Warrior", "Hunter", ...) is stored properly-capitalized to match AttendedRaid.class
  // exactly, but every template uses it mid-sentence ("Your {class} hit things...") — never
  // sentence-initial — so normal sentence casing means lowercasing it for display. `zone` stays
  // untouched: it's a proper noun ("Molten Core"), not a common noun.
  if (typeof vars.class === "string") {
    vars.class = vars.class.toLowerCase();
  }

  // `{countPhrase}` collapses "{minCount} of N" down to "all" once every tracked recipe is known
  // — earning every one of a small, fixed set reads better as "all" than as "6 of 6".
  if (ruleConfig.shape === "recipe_set_threshold") {
    const total = ruleConfig.recipeSpellIds.length;
    vars.countPhrase = ruleConfig.minCount === total ? "all" : `${ruleConfig.minCount} of ${total}`;
  }

  // Every `{?minCount}...{/minCount}` block in practice wraps the exact same optional suffix —
  // " {minCount} time{s} {window}" — added on top of a base sentence that already reads fine on
  // its own ("Your mage froze and/or burned things."). At minCount===1 (copper) that suffix would
  // resolve to "... once this season", which is redundant noise on a first-tier award; drop the
  // whole block rather than rendering it, so copper descriptions are just the base sentence and
  // higher tiers still get "... 5 times this season" etc.
  const withConditionals = template.replace(
    CONDITIONAL_RE,
    (_match, key: string, inner: string) => {
      if (key === "minCount" && vars[key] === 1) return "";
      return vars[key] ? substitute(inner, vars) : "";
    },
  );
  const resolved = substitute(withConditionals, vars).replace(/\s+/g, " ").trim();
  // Every `{minCount} time{minCount:s}`-style template resolves the count===1 case to the literal
  // substring "1 time" — simplify that to "once" ("Raided Molten Core once this season." reads
  // better than "...1 time this season."). A plain string swap rather than a template primitive
  // since it's the same fix regardless of which var produced the count.
  return resolved.replace(/\b1 time\b/g, "once");
}
