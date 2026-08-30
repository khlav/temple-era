# Reveal Overlay — Layers & Timing Reference

Companion to `reveal-overlay.html`. This file exists because the mockup's timing and
stacking bugs kept coming from the same root cause: the beat sequence and the z-index
stack were both implicit — scattered across `setTimeout` offsets and hardcoded numbers
— so a change in one place silently broke an assumption somewhere else. The code now
has two actual single-source-of-truth structures for this:

- **`Z`** (top of the second `<script>` block) + the CSS `var(--z-*)` properties it
  drives — the layer stack.
- **`buildCueSheet(tierName, opts)`** (just above `runCrossing`) — the beat timeline,
  played back by `playCueSheet()` in strict `t`-order regardless of authoring order.

This doc is the human-readable rendering of both, plus the config they don't fully
capture (`IMPACT`, `DIAMOND_CADENCE`) and a running list of the bug classes that made
this worth writing down. **Keep it manually in sync** — it's a reference, not a build
artifact; when you change a number in the code, update the matching number here in the
same edit.

## Layer stack (z-index)

One reveal's own composition, back to front. Defined once as `Z` in JS, consumed by
CSS via `var(--z-<name>)` and by JS via `Z.<name>` — never hardcode the number a third
time somewhere else.

| z | name | element | notes |
|---|---|---|---|
| 1 | `speedlines` | `.speedlines` | spinning rays behind everything; bronze doesn't render this element at all |
| 2 | `beam` | `.beam` | spotlight cone |
| 3 | `slash` | `.slash` (JS-appended) | anime cut streaks |
| 4 | `spark` | spark canvas (JS-appended) | particle-burst layer |
| 5 | `medal` | `.ring` / `.stage-inner` | the coin/frame itself; title text lives inside this layer too |
| 15 | `hitflash` | `.hitflash` | full-screen white impact flash (gold/platinum) |
| 16 | `novaflash` | `.supernova-flash` | full-screen white nova flash (diamond only) |

Not in `Z` (deliberately local sub-layers, not part of the shared stack):
- `.supernova-burst` — `z-index: 6`, but only meaningful among `.ring`'s own children
  (positioned inside the medal layer, not compared against outer siblings).
- `.frame`'s internal `z-index: 1/2/3` values (bled icon / glint / twinkles) — all
  scoped inside one medal's own frame, never compared outside it.

Page-level chrome sits entirely outside this stack — it's not part of any single
reveal's composition:

| z | element | purpose |
|---|---|---|
| 50 | `.cabinet` | Trophy Case shelf UI |
| 100 | `.blackout` | platinum/diamond full-black cover |
| 200 | `#stage` | the whole ceremony overlay |
| 250/260 | FX-test canvas | dev-only, bare spark test with no overlay open |
| 300 | `.fly-home` | medal flying to the shelf on dismiss |
| 400 | `.triggers` | dev trigger bar |

**Gotcha:** `.group` (wraps `.stage-inner` + the multi-award `.strip`) must never take
a `transform`. Any `transform` — even a pure `scale` or `translateY` — creates a new
stacking context, which traps `.beam`/`.ring`'s z-index comparisons against
`.speedlines`/`.slash`/the spark canvas (all siblings of `.group`) inside that new
context instead of the shared flat one they're deliberately interleaved in. This
happened for real: adding responsive `transform: scale()` sizing made the slashes and
speedlines render in front of the medal. Use `zoom` for pure rescaling and `padding`
for a shift-only nudge — neither creates a stacking context.

## Beat timeline (cue sheet)

Shared constants:

```
LAND_MS           = 1000  // medal's descendZoom flight lands
WINDUP_MS         = 500   // gold+: shake+grow tremor before the first cut
DIAMOND_BUILDUP_MS = 605  // last DIAMOND_CADENCE entry (485) + 120
```

`impactMs` and `heroZoomMs` (from `buildCueSheet`) branch by tier category:

| category | tiers | `impactMs` | `heroZoomMs` |
|---|---|---|---|
| non-impact | bronze, silver | `LAND_MS + 140` | `LAND_MS - 150` (starts *before* impactMs — no impact beat to wait for) |
| impact | gold, platinum | `LAND_MS + WINDUP_MS + 140` | `impactMs + 10` |
| diamond | diamond | `LAND_MS + WINDUP_MS + DIAMOND_BUILDUP_MS` | `impactMs + 260` |

Worked-out cue times (ms from reveal start, `t=0`). Recompute if the constants above
change — these are examples, not a second source of truth.

**Bronze** — `impactMs=1140`, `heroZoomMs=850`. No speedlines element, no slash/shake/spark (`IMPACT.bronze` is all-null).

| t | cue |
|---|---|
| 0 | descendZoom starts (medal flies in, 1s) |
| 850 | heroZoom + beam on |
| 1000 | `runImpact("bronze")` — no-op |
| 1290 | title-block on |
| 1550 | onSettle (multi-award strip only) |

**Silver** — same `impactMs`/`heroZoomMs` as bronze. `IMPACT.silver`: spark only, no slash/shake.

| t | cue |
|---|---|
| 0 | descendZoom starts |
| 850 | heroZoom + beam on |
| 1000 | `runImpact("silver")` → schedules spark internally at +240ms |
| 1240 | spark burst reads (internal to `runImpact`, not in the cue sheet) |
| 1290 | title-block on |
| 1350 | speedlines on |
| 1550 | onSettle |

**Gold** — `impactMs=1640`, `heroZoomMs=1650`. `IMPACT.gold`: 2 slashes, shake-hard, spark.

| t | cue |
|---|---|
| 0 | descendZoom starts |
| 1000 | windup on |
| 1500 | windup off, ring-pop, `runImpact("gold")` → 2 slashes (staggered 0/65ms) + shake-hard immediately; hitflash internally at +140ms; spark internally at +240ms |
| 1640 | hitflash reads (= `impactMs`, by design) |
| 1650 | heroZoom + beam on |
| 1790 | title-block on |
| 2150 | speedlines on |
| 2350 | onSettle |

**Platinum** — same `impactMs`/`heroZoomMs` as gold, plus the blackout beat. `IMPACT.platinum`: 3 slashes, shake-hard, big spark.

| t | cue |
|---|---|
| 0 | blackout on |
| 1000 | windup on |
| 1500 | windup off, ring-pop, `runImpact("platinum")` → 3 slashes (staggered 0/65/130ms) + shake-hard; hitflash internally at +140ms; spark internally at +240ms |
| 1640 | hitflash reads |
| 1650 | heroZoom + beam on |
| 1660 | blackout starts fading (near-simultaneous with heroZoom, by design) |
| 1790 | title-block on |
| 2100 | blackout fully cleared |
| 2150 | speedlines on |
| 2350 | onSettle |

**Diamond** — `impactMs=2105`, `heroZoomMs=2365`. Runs `runDiamondBuildup()` instead of `runImpact()`, plus blackout + fireworks.

| t | cue |
|---|---|
| 0 | blackout on |
| 1000 | windup on |
| 1500 | windup off, ring-pop, `runDiamondBuildup()` starts (screen is still blacked out through this whole buildup) |
| 1500–1985 | 6 slashes fired one at a time per `DIAMOND_CADENCE` (`[0,130,240,335,415,485]` ms after 1500), accelerating; `shake-build` drives the escalating tremor over the full 605ms |
| 2105 | buildup ends: `shake-hard` replaces `shake-build`, `fireSupernova()`, big star spark burst — `impactMs` |
| 2125 | blackout starts fading — right on the supernova's tail, so the flash cuts through the dark |
| 2255 | title-block on |
| 2365 | heroZoom + beam on |
| 2565 | blackout fully cleared |
| 2805 | fireworks start (continuous small bursts until dismissed) |
| 2865 | speedlines on |
| 3065 | onSettle |

### `IMPACT` ladder (per-tier slash/shake/spark config, feeds `runImpact`)

| tier | slashes | shake | spark |
|---|---|---|---|
| bronze | 0 | none | none |
| silver | 0 | none | count 160, scalar .85 |
| gold | 2 | shake-hard | count 280, scalar 1 |
| platinum | 3 | shake-hard | big |

Diamond doesn't use `IMPACT` at all — `runDiamondBuildup()` is its own path.

## Multi-award strip

`onSettle` (only present when `runMultiAward` passes it) fires at `heroZoomMs + 700`
and calls `showStrip()`, which staggers each chip in by `0.12s` and adds
`strip-open` to `#stage`. That class adds `padding-bottom: 36px` to `.group` — not a
`transform`, same stacking-context reason as above — which nudges the already-centered
composition up a bit further, layered on top of the natural recenter its own height
growth already causes.

## Gotcha log

Bug classes actually hit while building this, so they're recognizable faster next
time instead of re-diagnosed from scratch:

- **`animation-fill-mode: backwards` vs `both`** — `backwards` only applies *before*
  an animation starts; without `forwards`/`both`, the end state doesn't persist once
  it completes, so anything with no other static value for that property snaps back
  instantly. Hit on `.ring`'s `descendZoom` (visible tick before heroZoom) and
  `.continue`'s `fadeIn`.
- **Stale fixed CSS delay vs. dynamic timing** — `ringPop` and `.beam` both had fixed
  CSS `animation-delay`s tuned for a world without the wind-up; adding `WINDUP_MS`
  pushed the real impact later without updating them, so they fired mid-wind-up
  instead. Fixed by making both JS-triggered off the actual cue instead of a fixed
  delay — which is now moot with the cue sheet, since every beat is JS-timed already.
- **`.ring` class-name collision** — the supernova burst's inner elements were
  originally named `ring`/`ring2`/`core`, which collided with the outer medal's own
  `.ring` (190px, `descendZoom` + `::before`/`::after` pseudo-decorations, and an
  `#stage.ring-pop .ring` id-selector rule that wins on specificity). Renamed to
  `nova-ring`/`nova-ring2`/`nova-core`.
- **`transform` on `.group` breaks z-index interleaving** — see the Layer stack
  gotcha above. Any `transform` creates a stacking context; use `zoom`/`padding`
  instead for anything applied to `.group`.
- **`insertBefore` requires a direct child** — `fireSparks()` inserted its canvas via
  `stage.insertBefore(cv, stage.querySelector(".stage-inner"))`, which threw silently
  (swallowed by the function's own `try/catch`) once `.stage-inner` stopped being a
  direct child of `#stage` after the multi-award strip nested it inside `.group`. Any
  future DOM-nesting change needs a check for other code that assumes a stale parent
  relationship the same way.
