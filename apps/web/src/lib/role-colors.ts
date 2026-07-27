// Deterministic color per role, hashed from the role NAME rather than its id, so a role reads
// with the same color everywhere it's shown AND across databases (dev/preview/prod assign
// different role uuids, but the same name). Trade-off: renaming a role changes its color.
//
// Class strings are spelled out in full on purpose — Tailwind's scanner only sees literal
// strings, so building these by interpolating a hue would silently produce unstyled pills.
const ROLE_COLOR_CLASSES = [
  "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/40",
  "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40",
  "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40",
  "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/40",
  "bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-500/40",
  "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/40",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/40",
  "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/40",
  "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/40",
  "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/40",
  "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/40",
  "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/40",
  "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/40",
  "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/40",
  "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/40",
  "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/40",
  "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/40",
  "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/40",
  "bg-stone-500/10 text-stone-700 dark:text-stone-400 border-stone-500/40",
] as const;

// System roles get fixed, recognizable colors instead of the hashed palette: Admin is a bright,
// saturated yellow; Raid Manager is a deeper amber/bronze (still on-brand with the site's gold
// primary) so the two read as clearly distinct rather than two shades of the same yellow.
const ROLE_NAME_COLOR_OVERRIDES: Record<string, string> = {
  // Superadmin is env-granted and outranks everything, so it gets a multi-color gradient that
  // can't be mistaken for any hashed palette entry or the gold system-role shades.
  Superadmin:
    "bg-gradient-to-r from-fuchsia-500/25 via-violet-500/25 to-cyan-500/25 text-violet-700 dark:text-violet-200 border-violet-500/50",
  Admin: "bg-yellow-400/15 text-yellow-600 dark:text-yellow-300 border-yellow-400/50",
  "Raid Manager": "bg-amber-800/15 text-amber-800 dark:text-amber-500 border-amber-800/50",
};

// System roles always list first: Superadmin, then Admin, then Raid Manager, then the rest.
export const ROLE_NAME_SORT_PRIORITY: Record<string, number> = {
  Superadmin: -1,
  Admin: 0,
  "Raid Manager": 1,
};

export function roleColorClasses(roleName: string): string {
  const override = ROLE_NAME_COLOR_OVERRIDES[roleName];
  if (override) return override;

  let hash = 0;
  for (let i = 0; i < roleName.length; i++) hash = (hash * 31 + roleName.charCodeAt(i)) | 0;
  // Math.abs alone is unsafe here: |0 can yield -2147483648, whose abs is itself (still negative).
  const index =
    ((hash % ROLE_COLOR_CLASSES.length) + ROLE_COLOR_CLASSES.length) % ROLE_COLOR_CLASSES.length;
  return ROLE_COLOR_CLASSES[index] ?? ROLE_COLOR_CLASSES[0];
}

// Shared pill styling so a role reads identically wherever it's rendered (User Permissions and
// Roles tabs).
export const ROLE_PILL_BASE_CLASSES =
  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors";
