"use client";

import * as React from "react";
import Link from "next/link";
import "./reveal-overlay.css";
import type { UnseenAward } from "~/server/services/achievement-queries";
import { getSpellIconUrl } from "~/hooks/use-spell-icon";
import { PrettyPrintDate } from "~/lib/helpers";
import { EASTERN_TIMEZONE } from "~/lib/raid-formatting";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";

/*
 * Ported from docs/followups/mockups/reveal-overlay.html — see
 * docs/followups/mockups/reveal-overlay-notes.md for the layer-stack and cue-sheet reference.
 * This is a close port, not a reinterpretation: cue timings, the IMPACT ladder, and the
 * hero+strip layout are unchanged from the validated mockup. Real differences from the mockup,
 * logged in implementation-notes-phase-3.html/-phase-4.html:
 *   1. Arcanite tier (named "Diamond" through the achievement-engine ideation contract and this
 *      component's first several passes — renamed once "gold is worth more than platinum" made
 *      the metals-by-value ordering indefensible; see migration 0042 and achievement-schema.ts):
 *      an earlier pass of this port shipped before any achievement used the top tier, so it just
 *      reused platinum's treatment with escalated numbers. The mockup always defined a real
 *      distinct top-tier ceremony (chromatic frame/ring/speedlines/title, sparkle particles, an
 *      escalating 6-slash buildup on its own accelerating cadence, a supernova finish instead of
 *      a hitflash, and continuous fireworks after) — this is now ported in full, once real
 *      top-tier achievements (the class-attendance capstones) existed to justify it. The rename
 *      also swapped the frame's `hue-rotate` sweep (cycles the whole spectrum regardless of
 *      anchor color) for a `@property --spin`-driven angle rotation confined to fire tones, and
 *      the twinkle stars for rising embers — see the ro-arcanite rules in reveal-overlay.css.
 *   2. Medal art is a real WoW icon (`achievement.icon`, a Wowhead texture slug like
 *      "inv_sword_04") rendered via the CSS grayscale/sepia/hue-rotate colorize pipeline from
 *      docs/followups/mockups/wow-icon-medals.html, not the bundled Lucide icons an earlier pass
 *      of this component used — that swap was a real regression from the agreed art direction,
 *      caught and fixed during manual QA (see the achievement-engine QA log). Since these are now
 *      real network images, they're preloaded (Image().onload, with a timeout fallback) before
 *      the reveal sequence starts, matching the mockup's own intent for real artwork.
 */

export type AchievementTierLevel = "copper" | "silver" | "gold" | "thorium" | "arcanite";

export const TIER_CONFIG: Record<
  AchievementTierLevel,
  { tier: string; hi: string; labelColor: string; label: string; rank: number }
> = {
  // Warm terracotta-orange — real Copper's actual color (the mockup's original "bronze" swatch
  // was a darker, muddier brown, more alloy than raw ore).
  copper: { tier: "#8a4a28", hi: "#c97a45", labelColor: "#c97a45", label: "Copper", rank: 0 },
  silver: { tier: "#aab4bd", hi: "#dde5ec", labelColor: "#dde5ec", label: "Silver", rank: 1 },
  gold: { tier: "#d9a441", hi: "#f2cd6e", labelColor: "#f2cd6e", label: "Gold", rank: 2 },
  // Dull olive/moss — real Thorium ore's actual in-game color, distinct from gold's warm amber.
  thorium: { tier: "#6d7a4f", hi: "#a8b86a", labelColor: "#a8b86a", label: "Thorium", rank: 3 },
  // Molten-metal red/gold pair — base is the resting ember color, hi is the white-hot peak the
  // frame's conic-gradient sweeps through (see .ro-arcanite in reveal-overlay.css). labelColor is
  // independent of hi on purpose: a request to redden "the label" turned out to also redden the
  // frame border/gradient/embers/title-shimmer, since those all shared this same hi value — this
  // field lets the achievement-display.tsx chip label run its own color without touching hi.
  arcanite: { tier: "#8b2e2e", hi: "#f5b942", labelColor: "#ef5a35", label: "Arcanite", rank: 4 },
};

// Single source of truth for tier display labels — achievement-display.tsx and achievement-case.tsx
// both import this instead of keeping their own copy.
export const TIER_LABEL: Record<AchievementTierLevel, string> = {
  copper: TIER_CONFIG.copper.label,
  silver: TIER_CONFIG.silver.label,
  gold: TIER_CONFIG.gold.label,
  thorium: TIER_CONFIG.thorium.label,
  arcanite: TIER_CONFIG.arcanite.label,
};

// holderLabels only ever names up to MAX_NAMED_HOLDERS (achievement-queries.ts) — past that it's
// null and this bare count takes over. Spelled out for the common past-3 counts (a digit reads
// oddly at this size, "4 players"); past 10 the digit is the more scannable form and stays numeric.
const SPELLED_NUMBERS: Record<number, string> = {
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
};

/** "A, B, and C" — Oxford comma, 2 names getting the plain "A and B" form since a comma before a
 *  2-item "and" reads as a typo, not a list. */
function joinNames(labels: string[]): string {
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/** "Earned {date} • {rarity}" subline under the description.
 *  - 1 holder: "Only you have this achievement" ("you" always takes "have", never "has", same
 *    as "you are" vs "he is") or "Only {name} has this achievement".
 *  - 2-3 holders (holderLabels non-null, "you" sorted first when present — see
 *    achievement-queries.ts's withRarity): "{names} have this achievement", no "Only" — plural
 *    subjects don't carry the same "just them" implication a lone name does. Sentence-initial
 *    "you" is capitalized since there's no "Only" ahead of it here.
 *  - past that (holderLabels null): "{count} players have this achievement". */
function formatEarnedRarityLine(
  awardedAt: Date,
  holderCount: number,
  holderLabels: string[] | null,
): string {
  const date = PrettyPrintDate(awardedAt, false, EASTERN_TIMEZONE);
  let rarity: string;
  if (holderLabels && holderLabels.length === 1) {
    const label = holderLabels[0]!;
    rarity = `Only ${label} ${label === "you" ? "have" : "has"} this achievement`;
  } else if (holderLabels) {
    // Capitalize a sentence-initial "you" by swapping the label itself, not the joined string —
    // "you" only ever appears as a whole list entry, so this can't accidentally touch a name.
    const capitalized =
      holderLabels[0] === "you" ? ["You", ...holderLabels.slice(1)] : holderLabels;
    rarity = `${joinNames(capitalized)} have this achievement`;
  } else {
    // holderCount === 1 only reaches this branch via the same data-inconsistency edge case
    // achievement-queries.ts's withRarity guards against (holderLabels null despite a count of 1)
    // — singularized so it reads "1 player has", not "1 players have".
    const count = SPELLED_NUMBERS[holderCount] ?? String(holderCount);
    const noun = holderCount === 1 ? "player" : "players";
    const verb = holderCount === 1 ? "has" : "have";
    rarity = `${count} ${noun} ${verb} this achievement`;
  }
  return `Earned ${date} • ${rarity}`;
}

export function MedalIcon({ tier, icon }: { tier: AchievementTierLevel; icon: string }) {
  const src = getSpellIconUrl(icon, "large");
  if (tier === "thorium" || tier === "arcanite") {
    const isArcanite = tier === "arcanite";
    return (
      <div className={`ro-frame ${isArcanite ? "ro-arcanite" : "ro-thorium ro-fxsweep"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, not a local asset */}
        <img src={src} alt="" />
        <span className="ro-frame-border" />
        {/* arcanite-only rising embers — thorium gets ro-fxsweep's sheen pass instead,
            never both, matching the mockup's own medalHTML class choice. */}
        {isArcanite && (
          <span className="ro-embers">
            <i>●</i>
            <i>●</i>
            <i>●</i>
            <i>●</i>
            <i>●</i>
            <i>●</i>
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={`ro-coin ro-${tier}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, not a local asset */}
      <img src={src} alt="" />
      <span className="ro-coin-tint" aria-hidden="true" />
    </div>
  );
}

// Per-tier slash/shake/spark bundle — copper/silver never get any of the three; gold/thorium
// do. Arcanite isn't here — it runs its own longer buildup (see runArcaniteBuildup below),
// matching the mockup's own IMPACT ladder (which likewise excludes the top tier).
const IMPACT: Record<
  Exclude<AchievementTierLevel, "arcanite">,
  {
    slashes: number;
    shakeHard: boolean;
    spark: { count: number; scalar?: number; big?: boolean } | null;
  }
> = {
  copper: { slashes: 0, shakeHard: false, spark: null },
  silver: { slashes: 0, shakeHard: false, spark: { count: 160, scalar: 0.85 } },
  gold: { slashes: 2, shakeHard: true, spark: { count: 280, scalar: 1 } },
  thorium: { slashes: 3, shakeHard: true, spark: { count: 480, scalar: 1, big: true } },
};

const IMPACT_TIERS = new Set<AchievementTierLevel>(["gold", "thorium", "arcanite"]);
const LAND_MS = 1000;
const WINDUP_MS = 500;
const SLASH_ANGLES = [-35, -145, -62, 12, -110, -198];
// arcanite-only: 6 slashes fired one at a time on an accelerating cadence (tension rising toward
// the finish) instead of gold/thorium's simultaneous burst — shrinking gaps between entries.
const ARCANITE_SLASH_COUNT = 6;
const ARCANITE_CADENCE = [0, 130, 240, 335, 415, 485];
const ARCANITE_BUILDUP_MS = ARCANITE_CADENCE[ARCANITE_CADENCE.length - 1]! + 120;

interface Cue {
  t: number;
  run: () => void;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  sprite: HTMLCanvasElement;
  batchId: number;
}

/** One shared canvas + RAF loop for every fireSparks burst in a single reveal, instead of each
 *  burst spinning up its own full-stage canvas with its own clear+redraw loop. Concurrent bursts
 *  (impact spark + fireworks, or two overlapping fireworks bursts) used to mean N canvases each
 *  doing a full-canvas destination-out clear every frame — that's what read as stuttering, not any
 *  single burst being too big. Created once per reveal (see the RevealOverlay effect that builds
 *  `refs`) and torn down on dismiss/unmount; the RAF loop itself starts on first use and stops
 *  itself (but leaves the canvas in place, ready for the next burst) whenever the shared particle
 *  pool empties out, rather than running an idle loop for the whole reveal. */
interface SparkEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  particles: SparkParticle[];
  raf: number;
  nextBatchId: number;
  batchRemaining: Map<number, number>;
  batchDone: Map<number, () => void>;
  spriteCache: Map<string, HTMLCanvasElement>;
}

function createSparkEngine(stageEl: HTMLDivElement, groupEl: HTMLDivElement): SparkEngine {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;z-index:4;pointer-events:none";
  canvas.width = stageEl.clientWidth;
  canvas.height = stageEl.clientHeight;
  stageEl.insertBefore(canvas, groupEl);
  return {
    canvas,
    ctx: canvas.getContext("2d")!,
    particles: [],
    raf: 0,
    nextBatchId: 0,
    batchRemaining: new Map(),
    batchDone: new Map(),
    spriteCache: new Map(),
  };
}

function destroySparkEngine(engine: SparkEngine) {
  if (engine.raf) cancelAnimationFrame(engine.raf);
  engine.canvas.remove();
}

/** A dying particle's batch may reach zero mid-frame (not just at burst start) — this is the only
 *  place batch completion is detected, so every particle death (life<=0 up front, or decayed below
 *  the visible-size floor during the frame loop) must route through it. */
function markParticleDead(engine: SparkEngine, batchId: number) {
  const remaining = (engine.batchRemaining.get(batchId) ?? 1) - 1;
  if (remaining > 0) {
    engine.batchRemaining.set(batchId, remaining);
    return;
  }
  engine.batchRemaining.delete(batchId);
  const onDone = engine.batchDone.get(batchId);
  engine.batchDone.delete(batchId);
  onDone?.();
}

function runSparkEngine(engine: SparkEngine) {
  if (engine.raf) return; // already running
  const frame = () => {
    const { ctx, canvas } = engine;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    engine.particles = engine.particles.filter((p) => {
      p.vx *= 0.988;
      p.vy *= 0.988;
      p.vy += 0.12;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      const s = p.size * p.life;
      if (s < 0.3) {
        markParticleDead(engine, p.batchId);
        return false;
      }
      ctx.globalAlpha = Math.min(0.85, p.life * 1.2);
      ctx.drawImage(p.sprite, p.x - s, p.y - s, s * 2, s * 2);
      return true;
    });
    ctx.globalAlpha = 1;
    if (engine.particles.length > 0) engine.raf = requestAnimationFrame(frame);
    else engine.raf = 0;
  };
  engine.raf = requestAnimationFrame(frame);
}

interface StageRefs {
  stageEl: HTMLDivElement;
  groupEl: HTMLDivElement;
  sparks: SparkEngine;
}

/** Fires diagonal slash streaks aimed at the medal, with a hitflash 140ms later (mirrors the
 *  mockup's fireSlashes — same stagger, same escalation-by-index growth/hue-shift). `startIndex`
 *  places a single slash further along the escalation — used by the arcanite buildup, which fires
 *  one slash at a time via repeated calls rather than a simultaneous burst; `withFlash` lets that
 *  same buildup skip the hitflash on every individual call (it caps its whole sequence with one
 *  supernova instead). */
function fireSlashes(refs: StageRefs, count: number, startIndex = 0, withFlash = true) {
  const coin = refs.stageEl.querySelector(".ro-coin, .ro-frame");
  const r = coin?.getBoundingClientRect();
  const ax = Math.round(r ? r.left + r.width / 2 : window.innerWidth / 2);
  const ay = Math.round(r ? r.top + r.height / 2 : window.innerHeight / 2);
  for (let n = 0; n < count; n++) {
    const i = startIndex + n;
    const s = document.createElement("div");
    s.className = "ro-slash";
    s.style.setProperty("--ro-ang", `${SLASH_ANGLES[i % SLASH_ANGLES.length]}deg`);
    s.style.left = `${ax}px`;
    s.style.top = `${ay}px`;
    // within one call's own burst, stagger slightly for a rapid-hit rhythm; the arcanite buildup
    // spaces its calls itself via setTimeout, so this stays 0 there (n is always 0).
    s.style.animationDelay = `${Math.min(n, 2) * 65}ms`;
    const grow = Math.min(i, 5) / 5;
    s.style.height = `${3 + grow * 14}px`;
    s.style.filter = `hue-rotate(${(i * 47) % 360}deg) brightness(${1 + grow * 0.7})`;
    refs.stageEl.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
  if (withFlash) {
    setTimeout(() => {
      const fl = document.createElement("div");
      fl.className = "ro-hitflash";
      refs.stageEl.appendChild(fl);
      setTimeout(() => fl.remove(), 300);
    }, 140);
  }
}

function getOrMakeSprite(engine: SparkEngine, color: string, star: boolean): HTMLCanvasElement {
  const key = `${color}|${star}`;
  const cached = engine.spriteCache.get(key);
  if (cached) return cached;
  const s = document.createElement("canvas");
  s.width = s.height = 32;
  const g = s.getContext("2d")!;
  if (star) {
    // four-point glint: two elongated rhombi crossed + soft halo
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,.95)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(16, 1);
    g.lineTo(19, 16);
    g.lineTo(16, 31);
    g.lineTo(13, 16);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(1, 16);
    g.lineTo(16, 13);
    g.lineTo(31, 16);
    g.lineTo(16, 19);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillRect(15, 15, 2, 2);
  } else {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
  }
  engine.spriteCache.set(key, s);
  return s;
}

/** Additive-blend particle burst — ported near-verbatim from the mockup's fireSparks, but drawing
 *  into the reveal's one shared canvas (refs.sparks) instead of spinning up its own: every call
 *  just appends particles to the shared pool (tagged with a batchId so `opts.onDone` still fires
 *  when *this* burst's particles are gone, even while other bursts' particles are still animating
 *  alongside them) and makes sure the shared RAF loop is running. `xPct`/`yPct` place the burst's
 *  origin as a percentage of the stage (50/42 centers it behind the medal, matching every
 *  non-fireworks call site); the continuous fireworks loop below passes random positions instead.
 *  `opts.star` swaps the soft circular glow sprite for a four-point glint (arcanite's climax burst
 *  and its fireworks). */
function fireSparks(
  refs: StageRefs,
  xPct: number,
  yPct: number,
  colors: string[],
  opts: { count: number; scalar?: number; big?: boolean; star?: boolean; onDone?: () => void },
) {
  try {
    const engine = refs.sparks;
    const cx = engine.canvas.width * (xPct / 100);
    const cy = engine.canvas.height * (yPct / 100);
    const big = !!opts.big;
    const star = !!opts.star;
    const sprites = colors.map((c) => getOrMakeSprite(engine, c, star));

    const batchId = engine.nextBatchId++;
    const N = opts.count;
    engine.batchRemaining.set(batchId, N);
    if (opts.onDone) engine.batchDone.set(batchId, opts.onDone);

    for (let i = 0; i < N; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = Math.random() ** 2 * (big ? 18 : 13) + 1.5;
      engine.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * v * (1 + Math.random() * 0.4),
        vy: Math.sin(ang) * v * (1 + Math.random() * 0.4),
        life: 1,
        decay: 0.005 + Math.random() * 0.014,
        size: (2 + Math.random() * 5) * (opts.scalar ?? 1) * (big ? 2 : 1.6),
        sprite: sprites[(Math.random() * sprites.length) | 0]!,
        batchId,
      });
    }
    runSparkEngine(engine);
  } catch {
    // Same swallow-and-skip as before: a cosmetic burst failing must never break the reveal.
  }
}

function runImpact(refs: StageRefs, tier: Exclude<AchievementTierLevel, "arcanite">) {
  const cfg = IMPACT[tier];
  const t = TIER_CONFIG[tier];
  if (cfg.slashes > 0) fireSlashes(refs, cfg.slashes);
  if (cfg.spark) {
    setTimeout(() => {
      fireSparks(refs, 50, 42, [t.hi, t.tier, "#ffffff", "#ffd166", "#ffedc2"], cfg.spark!);
    }, 240);
  }
  if (cfg.shakeHard) refs.stageEl.classList.add("ro-shake-hard");
}

/** arcanite-only: brighter/bigger finish than a hitflash, caps the escalating buildup. The flash
 *  stays fixed to the viewport (whitewashes everything); the core/ring burst is appended INSIDE
 *  .ro-ring instead of positioned via a one-time snapshot, so heroZoom's transform (which fires
 *  260ms later) carries the burst along with the medal instead of leaving it orphaned at the old
 *  spot. Reads --ro-tier/--ro-hi from .ro-stage via CSS inheritance — no tier param needed. */
function fireSupernova(refs: StageRefs) {
  const flash = document.createElement("div");
  flash.className = "ro-supernova-flash";
  refs.stageEl.appendChild(flash);
  setTimeout(() => flash.remove(), 400);

  const ring = refs.stageEl.querySelector(".ro-ring");
  if (!ring) return;
  const burst = document.createElement("div");
  burst.className = "ro-supernova-burst";
  burst.innerHTML = `<div class="ro-nova-ring"></div><div class="ro-nova-ring2"></div><div class="ro-nova-core"></div>`;
  ring.appendChild(burst);
  setTimeout(() => burst.remove(), 1100);
}

/** arcanite-only: 6 slashes fired one at a time on an accelerating cadence (tension rising toward
 *  the finish), an escalating tremor riding alongside, capped by a supernova instead of the other
 *  tiers' single hitflash. Buildup timeouts are pushed onto the shared `timers` array so an early
 *  dismiss cancels whatever hasn't fired yet, same as every cue-sheet beat. */
function runArcaniteBuildup(refs: StageRefs, timers: number[]) {
  ARCANITE_CADENCE.slice(0, ARCANITE_SLASH_COUNT).forEach((d, i) => {
    timers.push(window.setTimeout(() => fireSlashes(refs, 1, i, false), d));
  });
  refs.stageEl.style.setProperty("--ro-build-ms", `${ARCANITE_BUILDUP_MS}ms`);
  refs.stageEl.classList.add("ro-shake-build");
  timers.push(
    window.setTimeout(() => {
      refs.stageEl.classList.remove("ro-shake-build");
      refs.stageEl.classList.add("ro-shake-hard");
      fireSupernova(refs);
      const d = TIER_CONFIG.arcanite;
      // 900 in the mock — trimmed for real-hardware framerate; this is still the single biggest
      // burst in the whole ceremony (a one-time moment, not a repeating cost like fireworks).
      // Warm-only accent set (white flash, gold, orange, deep red) — the diamond-era pink/blue
      // pastels were dropped so the climax burst stays inside the same fire palette as the frame.
      fireSparks(refs, 50, 42, [d.hi, d.tier, "#ffffff", "#ffd166", "#ff8c42", "#c1121f"], {
        big: true,
        star: true,
        count: 350,
        scalar: 1.3,
      });
    }, ARCANITE_BUILDUP_MS),
  );
}

// fireSparks now draws into one shared canvas (SparkEngine) rather than spinning up its own per
// burst, so this cap is no longer about canvas/clear pileup — it's just a ceiling on how many
// bursts' worth of particles are live in the shared pool at once. Raised from 2 to 4 now that the
// shared-canvas engine means more concurrent bursts costs one bigger draw loop, not more clear
// passes. A tick that would exceed it just skips rather than queuing, since a missed ambient
// sparkle is invisible but a dropped frame isn't.
const MAX_CONCURRENT_FIREWORK_BURSTS = 4;

/** arcanite-only: continuous small spark bursts at random positions until dismissed — the
 *  post-impact flourish that plays alongside the reveal sitting on screen. Returns the interval
 *  id so the caller can clear it on dismiss/unmount; nothing here self-stops. */
function startFireworks(refs: StageRefs, tier: AchievementTierLevel): number {
  const t = TIER_CONFIG[tier];
  const colors = [t.hi, t.tier, "#ffffff", "#ffd166", "#ff8c42"];
  const isArcanite = tier === "arcanite";
  let activeBursts = 0;
  const spawn = (
    xPct: number,
    yPct: number,
    sparkOpts: { count: number; scalar?: number; star?: boolean },
  ) => {
    if (activeBursts >= MAX_CONCURRENT_FIREWORK_BURSTS) return;
    activeBursts++;
    fireSparks(refs, xPct, yPct, colors, {
      ...sparkOpts,
      onDone: () => {
        activeBursts--;
      },
    });
  };
  return window.setInterval(
    () => {
      // flat counts, no random addition — one fewer thing to reason about per burst. Closer to
      // the mock's own 80-130/50-100 now that the shared-canvas engine (see SparkEngine above)
      // made per-particle cost cheap again — these were trimmed hard back when every burst paid
      // for its own canvas and clear pass.
      spawn(15 + Math.random() * 70, 12 + Math.random() * 38, {
        star: isArcanite,
        count: isArcanite ? 75 : 55,
        scalar: 0.9 + Math.random() * 0.7,
      });
      // occasional double-pop
      if (Math.random() < 0.35) {
        setTimeout(() => {
          spawn(20 + Math.random() * 60, 10 + Math.random() * 35, {
            count: 40,
            scalar: 0.8,
          });
        }, 180);
      }
    },
    isArcanite ? 430 : 650,
  );
}

/** Same cue-sheet pattern as the mockup — one flat, time-ordered list of beats, played back
 *  sorted by `t` regardless of authoring order. See reveal-overlay-notes.md's worked timing
 *  tables if a beat's timing here ever needs to change. `timers` collects every setTimeout this
 *  builds (including runArcaniteBuildup's own nested ones) so the caller can cancel them all on
 *  an early dismiss; `onFireworksStart` lets the caller capture the interval id startFireworks
 *  returns, since that one doesn't self-stop and needs clearing on dismiss/unmount too. */
function buildCueSheet(
  refs: StageRefs,
  tier: AchievementTierLevel,
  setClass: (cls: string, on: boolean) => void,
  onSettle: (() => void) | undefined,
  timers: number[],
  onFireworksStart: (id: number) => void,
): Cue[] {
  const isImpact = IMPACT_TIERS.has(tier);
  const isArcanite = tier === "arcanite";
  // arcanite's buildup runs longer than gold/thorium's simultaneous burst, so it earns a longer
  // wait before the impact reads and before the camera punches in on it.
  const impactMs = isArcanite
    ? LAND_MS + WINDUP_MS + ARCANITE_BUILDUP_MS
    : isImpact
      ? LAND_MS + WINDUP_MS + 140
      : LAND_MS + 140;
  const heroZoomMs = isArcanite ? impactMs + 260 : isImpact ? impactMs + 10 : LAND_MS - 150;

  const cues: Cue[] = [];

  if (tier === "thorium" || isArcanite) {
    cues.push({ t: 0, run: () => setClass("ro-blackout-on", true) });
    cues.push({ t: impactMs + 20, run: () => setClass("ro-blackout-off", true) });
    cues.push({
      t: impactMs + 460,
      run: () => {
        setClass("ro-blackout-on", false);
        setClass("ro-blackout-off", false);
      },
    });
  }
  if (isArcanite) {
    // fires well after the supernova has read, so the bursts feel like a flourish riding on top
    // of the settled reveal rather than competing with the impact itself.
    cues.push({ t: impactMs + 700, run: () => onFireworksStart(startFireworks(refs, tier)) });
  }

  if (isImpact) {
    cues.push({ t: LAND_MS, run: () => refs.stageEl.classList.add("ro-windup") });
    cues.push({
      t: LAND_MS + WINDUP_MS,
      run: () => {
        refs.stageEl.classList.remove("ro-windup");
        refs.stageEl.classList.add("ro-ring-pop");
        if (isArcanite) runArcaniteBuildup(refs, timers);
        else runImpact(refs, tier as Exclude<AchievementTierLevel, "arcanite">);
      },
    });
  } else {
    // never arcanite here — !isImpact means copper/silver, since IMPACT_TIERS is
    // {gold, thorium, arcanite}; TS can't prove that through a Set.has check.
    cues.push({
      t: LAND_MS,
      run: () => runImpact(refs, tier as Exclude<AchievementTierLevel, "arcanite">),
    });
  }

  cues.push({
    t: impactMs + 150,
    run: () => refs.stageEl.querySelector(".ro-title-block")?.classList.add("ro-on"),
  });

  cues.push({
    t: heroZoomMs,
    run: () => {
      const inner = refs.stageEl.querySelector<HTMLElement>(".ro-stage-inner");
      if (inner) inner.style.animation = "ro-heroZoom .5s cubic-bezier(.2,1.1,.3,1) forwards";
      refs.stageEl.querySelector(".ro-beam")?.classList.add("ro-on");
    },
  });
  cues.push({
    t: heroZoomMs + 500,
    run: () => refs.stageEl.querySelector(".ro-speedlines")?.classList.add("ro-on"),
  });
  if (onSettle) {
    cues.push({ t: heroZoomMs + 700, run: onSettle });
  }

  return cues;
}

function playCueSheet(cues: Cue[], timers: number[]) {
  cues
    .slice()
    .sort((a, b) => a.t - b.t)
    .forEach((c) => {
      if (c.t === 0) c.run();
      else timers.push(window.setTimeout(c.run, c.t));
    });
}

/** rarest-first, most-recently-earned breaks ties — matches getUnseenAwards' own ordering, kept
 *  here too so a caller passing an unsorted array still renders correctly. */
export function pickHero(awards: UnseenAward[]): UnseenAward {
  return [...awards].sort((a, b) => {
    const r = TIER_CONFIG[b.tier].rank - TIER_CONFIG[a.tier].rank;
    if (r !== 0) return r;
    return new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime();
  })[0]!;
}

/** Collapses a batch of unseen awards down to one entry per achievement (its highest crossed
 *  tier) — a Copper→Thorium jump in one evaluation pass creates 4 real `achievement_award`
 *  rows (append-per-crossing, by design), but the reveal ceremony and unseen-count badge should
 *  only ever show "Thorium", not Copper/Silver/Gold/Thorium as four separate entries. Callers
 *  that need every underlying row (e.g. markSeen, which must mark all of them regardless of what
 *  was displayed) should keep using the raw, undeduped array — this is a display-only view. */
export function collapseToHighestTierPerAchievement(awards: UnseenAward[]): UnseenAward[] {
  const byAchievement = new Map<string, UnseenAward>();
  for (const award of awards) {
    const existing = byAchievement.get(award.achievementId);
    if (!existing || TIER_CONFIG[award.tier].rank > TIER_CONFIG[existing.tier].rank) {
      byAchievement.set(award.achievementId, award);
    }
  }
  return [...byAchievement.values()];
}

export interface RevealOverlayProps {
  /** Not required to be pre-sorted — pickHero re-sorts internally. */
  awards: UnseenAward[];
  onDismiss: () => void;
  /** Set by AchievementDisplay's own replay trigger — the "View achievements" CTA would just
   *  point at the achievement list already sitting right behind the overlay (character page or
   *  the Achievements page itself), so it's redundant there. Every other trigger (the FAB) still
   *  shows it, since the achievement list isn't already on screen in those cases. */
  hideViewLink?: boolean;
}

export function RevealOverlay({
  awards,
  onDismiss,
  hideViewLink,
}: RevealOverlayProps): React.JSX.Element | null {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const groupRef = React.useRef<HTMLDivElement>(null);
  const [blackoutOn, setBlackoutOn] = React.useState(false);
  const [blackoutOff, setBlackoutOff] = React.useState(false);
  const [stripOpen, setStripOpen] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  const hero = React.useMemo(() => pickHero(awards), [awards]);
  const rest = React.useMemo(
    () => awards.filter((a) => a.achievementAwardId !== hero.achievementAwardId),
    [awards, hero],
  );
  const shown = rest.slice(0, 5);
  const overflowAwards = rest.slice(5);
  const overflow = overflowAwards.length;

  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;

  React.useEffect(() => {
    // Real network images now (see file header) — preload the hero + visible strip icons so the
    // sequence never opens on a broken/unloaded medal. A per-image timeout means one slow/dead
    // CDN request can't hang the whole reveal.
    let cancelled = false;
    const urls = new Set([hero, ...shown].map((a) => getSpellIconUrl(a.icon, "large")));
    const preload = (url: string) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
        window.setTimeout(resolve, 800);
      });
    Promise.all([...urls].map(preload)).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hero/shown are stable for the life of one reveal
  }, []);

  // Arcanite's continuous fireworks (startFireworks) don't self-stop — this holds the interval id
  // so it can be cleared alongside the cue timers below on early dismiss/unmount.
  const fireworksIntervalRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!ready || !stageRef.current || !groupRef.current) return;
    const sparks = createSparkEngine(stageRef.current, groupRef.current);
    const refs: StageRefs = { stageEl: stageRef.current, groupEl: groupRef.current, sparks };
    const timers: number[] = [];

    const setClass = (cls: string, on: boolean) => {
      if (cls === "ro-blackout-on") setBlackoutOn(on);
      if (cls === "ro-blackout-off") setBlackoutOff(on);
    };

    const cues = buildCueSheet(
      refs,
      hero.tier,
      setClass,
      rest.length > 0 ? () => setStripOpen(true) : undefined,
      timers,
      (id) => {
        fireworksIntervalRef.current = id;
      },
    );
    playCueSheet(cues, timers);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      if (fireworksIntervalRef.current !== null) {
        window.clearInterval(fireworksIntervalRef.current);
        fireworksIntervalRef.current = null;
      }
      destroySparkEngine(sparks);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hero/rest are stable for the life of one reveal
  }, [ready]);

  React.useEffect(() => {
    // Any click dismisses — the mockup's own listener excludes only its dev trigger bar, which
    // has no production equivalent here.
    const handleClick = () => {
      dismissRef.current();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Escape") {
        e.preventDefault();
        dismissRef.current();
      }
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  if (!hero) return null;

  const t = TIER_CONFIG[hero.tier];
  const stageClassName = [
    "ro-stage",
    "ro-on",
    hero.tier === "thorium"
      ? "ro-thorium-ring"
      : hero.tier === "arcanite"
        ? "ro-arcanite-ring"
        : "",
    stripOpen ? "ro-strip-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ro-root">
      <div className={`ro-blackout ${blackoutOn ? "ro-on" : ""} ${blackoutOff ? "ro-off" : ""}`} />
      <div
        ref={stageRef}
        className={stageClassName}
        style={{ ["--ro-tier" as string]: t.tier, ["--ro-hi" as string]: t.hi }}
      >
        {hero.tier !== "copper" && <div className="ro-speedlines" />}
        <div ref={groupRef} className="ro-group">
          <div className="ro-stage-inner">
            <div className="ro-beam" />
            <div className="ro-ring">
              <MedalIcon tier={hero.tier} icon={hero.icon} />
            </div>
            <div className="ro-title-block">
              <h1>{hero.name}</h1>
              <div className="ro-tier-sub">{t.label} achievement</div>
              {hero.description && <div className="ro-description">{hero.description}</div>}
              <div className="ro-earned-line">
                {formatEarnedRarityLine(hero.awardedAt, hero.holderCount, hero.holderLabels)}
              </div>
              {rest.length > 0 && (
                <div className={`ro-strip ${stripOpen ? "ro-open" : ""}`}>
                  <div className="ro-strip-inner">
                    <div className="ro-strip-panel">
                      <div className="ro-strip-head">Also earned</div>
                      <TooltipProvider delayDuration={0}>
                        <div className="ro-strip-row">
                          {shown.map((a, i) => {
                            const at = TIER_CONFIG[a.tier];
                            const chip = (
                              <div
                                className="ro-chip"
                                style={{
                                  ["--ro-tier" as string]: at.tier,
                                  ["--ro-hi" as string]: at.hi,
                                }}
                              >
                                <div
                                  className="ro-medal-wrap"
                                  style={{ animationDelay: `${i * 0.12}s` }}
                                >
                                  <MedalIcon tier={a.tier} icon={a.icon} />
                                </div>
                                <div
                                  className="ro-label"
                                  style={{ animationDelay: `${i * 0.12 + 0.18}s` }}
                                >
                                  <b>{a.name}</b>
                                  <small>{at.label}</small>
                                </div>
                              </div>
                            );
                            if (!a.description) {
                              return (
                                <React.Fragment key={a.achievementAwardId}>{chip}</React.Fragment>
                              );
                            }
                            return (
                              <Tooltip key={a.achievementAwardId}>
                                <TooltipTrigger asChild>{chip}</TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="z-[300] max-w-64 bg-secondary text-center text-muted-foreground"
                                >
                                  {a.description}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                          {overflow > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="ro-chip ro-more">
                                  <div
                                    className="ro-plus"
                                    style={{ animationDelay: `${shown.length * 0.12}s` }}
                                  >
                                    +{overflow}
                                  </div>
                                  <div
                                    className="ro-label"
                                    style={{ animationDelay: `${shown.length * 0.12 + 0.18}s` }}
                                  >
                                    more
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="z-[300] max-w-64 bg-secondary text-muted-foreground"
                              >
                                <div className="flex flex-col gap-1 text-left">
                                  <span className="font-semibold text-foreground">Also:</span>
                                  {overflowAwards.map((a) => (
                                    <div
                                      key={a.achievementAwardId}
                                      className="flex items-center gap-1.5"
                                    >
                                      <div
                                        className="ro-icon-xs relative shrink-0"
                                        style={{
                                          ["--ro-tier" as string]: TIER_CONFIG[a.tier].tier,
                                          ["--ro-hi" as string]: TIER_CONFIG[a.tier].hi,
                                        }}
                                      >
                                        <MedalIcon tier={a.tier} icon={a.icon} />
                                      </div>
                                      <span>{a.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              )}
              <div className="ro-continue-row">
                <div className="ro-continue">Click to continue</div>
                {!hideViewLink && (
                  <>
                    <span className="ro-continue-sep" aria-hidden="true">
                      •
                    </span>
                    <Link href="/achievements" className="ro-view-link">
                      View achievements
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
