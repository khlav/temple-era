"use client";

import * as React from "react";
import {
  Trophy,
  Compass,
  Drama,
  Sofa,
  ShieldPlus,
  Flame,
  Backpack,
  AlarmClock,
  Bike,
  CalendarCheck,
  CheckCircle,
  Shuffle,
  Armchair,
  MapPin,
  Zap,
  Users,
  Users2,
  Crown,
  type LucideIcon,
} from "lucide-react";
import "./reveal-overlay.css";
import type { UnseenAward } from "~/server/services/achievement-queries";

/*
 * Ported from docs/followups/mockups/reveal-overlay.html — see
 * docs/followups/mockups/reveal-overlay-notes.md for the layer-stack and cue-sheet reference.
 * This is a close port, not a reinterpretation: cue timings, the IMPACT ladder, and the
 * hero+strip layout are unchanged from the validated mockup. Two real differences from the
 * mockup, both logged in implementation-notes-phase-3.html:
 *   1. Diamond tier is not ported (no achievement uses it yet — see the contract's decision log).
 *   2. Medal art is a bundled Lucide icon (resolved from `achievement.icon`, a Lucide icon name),
 *      not an external `wow.zamimg.com` image URL — no real award artwork exists yet. This also
 *      means there is nothing to network-preload; every icon is already in the JS bundle, so the
 *      "preload before playing" requirement is satisfied trivially (see RevealFab).
 */

export type AchievementTierLevel = "bronze" | "silver" | "gold" | "platinum";

const TIER_CONFIG: Record<
  AchievementTierLevel,
  { tier: string; hi: string; label: string; rank: number }
> = {
  bronze: { tier: "#a5673f", hi: "#c98a58", label: "Bronze", rank: 0 },
  silver: { tier: "#aab4bd", hi: "#dde5ec", label: "Silver", rank: 1 },
  gold: { tier: "#d9a441", hi: "#f2cd6e", label: "Gold", rank: 2 },
  platinum: { tier: "#8fa3b8", hi: "#e5e9f0", label: "Platinum", rank: 3 },
};

// Single source of truth for tier display labels — achievement-display.tsx and trophy-case.tsx
// both import this instead of keeping their own copy.
export const TIER_LABEL: Record<AchievementTierLevel, string> = {
  bronze: TIER_CONFIG.bronze.label,
  silver: TIER_CONFIG.silver.label,
  gold: TIER_CONFIG.gold.label,
  platinum: TIER_CONFIG.platinum.label,
};

// Every icon name used by achievement-definitions.ts, plus a generic fallback. Extend this map
// (not achievement-rules.ts) when a new achievement definition names a new icon.
const ICON_MAP: Record<string, LucideIcon> = {
  trophy: Trophy,
  compass: Compass,
  drama: Drama,
  sofa: Sofa,
  "shield-plus": ShieldPlus,
  flame: Flame,
  backpack: Backpack,
  "alarm-clock": AlarmClock,
  bike: Bike,
  "calendar-check": CalendarCheck,
  "check-circle": CheckCircle,
  shuffle: Shuffle,
  armchair: Armchair,
  "map-pin": MapPin,
  zap: Zap,
  users: Users,
  "users-2": Users2,
  crown: Crown,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Trophy;
}

function MedalIcon({ tier, icon }: { tier: AchievementTierLevel; icon: string }) {
  const Icon = resolveIcon(icon);
  if (tier === "platinum") {
    return (
      <div className="ro-frame ro-plat ro-fxsweep">
        <Icon />
        <span className="ro-frame-border" />
      </div>
    );
  }
  return (
    <div className={`ro-coin ro-${tier}`}>
      <Icon />
    </div>
  );
}

// Per-tier slash/shake/spark bundle — bronze/silver never get any of the three; gold/platinum do.
const IMPACT: Record<
  AchievementTierLevel,
  {
    slashes: number;
    shakeHard: boolean;
    spark: { count: number; scalar?: number; big?: boolean } | null;
  }
> = {
  bronze: { slashes: 0, shakeHard: false, spark: null },
  silver: { slashes: 0, shakeHard: false, spark: { count: 160, scalar: 0.85 } },
  gold: { slashes: 2, shakeHard: true, spark: { count: 280, scalar: 1 } },
  platinum: { slashes: 3, shakeHard: true, spark: { count: 480, scalar: 1, big: true } },
};

const IMPACT_TIERS = new Set<AchievementTierLevel>(["gold", "platinum"]);
const LAND_MS = 1000;
const WINDUP_MS = 500;
const SLASH_ANGLES = [-35, -145, -62, 12, -110, -198];

interface Cue {
  t: number;
  run: () => void;
}

interface StageRefs {
  stageEl: HTMLDivElement;
  groupEl: HTMLDivElement;
}

/** Fires 1-3 diagonal slash streaks aimed at the medal, with a hitflash 140ms later (mirrors the
 *  mockup's fireSlashes — same stagger, same escalation-by-index growth/hue-shift). */
function fireSlashes(refs: StageRefs, count: number) {
  const coin = refs.stageEl.querySelector(".ro-coin, .ro-frame");
  const r = coin?.getBoundingClientRect();
  const ax = Math.round(r ? r.left + r.width / 2 : window.innerWidth / 2);
  const ay = Math.round(r ? r.top + r.height / 2 : window.innerHeight / 2);
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "ro-slash";
    s.style.setProperty("--ro-ang", `${SLASH_ANGLES[i % SLASH_ANGLES.length]}deg`);
    s.style.left = `${ax}px`;
    s.style.top = `${ay}px`;
    s.style.animationDelay = `${i * 65}ms`;
    const grow = Math.min(i, 5) / 5;
    s.style.height = `${3 + grow * 14}px`;
    s.style.filter = `hue-rotate(${(i * 47) % 360}deg) brightness(${1 + grow * 0.7})`;
    refs.stageEl.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
  setTimeout(() => {
    const fl = document.createElement("div");
    fl.className = "ro-hitflash";
    refs.stageEl.appendChild(fl);
    setTimeout(() => fl.remove(), 300);
  }, 140);
}

/** Canvas2D additive-blend particle burst — ported near-verbatim from the mockup's fireSparks.
 *  Inserted before .ro-group (not .ro-stage-inner) so it sits behind the medal per the layer
 *  stack, and stays a direct child of .ro-stage per the mockup's own insertBefore requirement. */
function fireSparks(
  refs: StageRefs,
  colors: string[],
  opts: { count: number; scalar?: number; big?: boolean },
) {
  try {
    const cv = document.createElement("canvas");
    cv.style.cssText = `position:absolute;inset:0;z-index:${4};pointer-events:none`;
    cv.width = refs.stageEl.clientWidth;
    cv.height = refs.stageEl.clientHeight;
    refs.stageEl.insertBefore(cv, refs.groupEl);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const cx = cv.width * 0.5;
    const cy = cv.height * 0.42;
    const big = !!opts.big;

    function makeSprite(color: string) {
      const s = document.createElement("canvas");
      s.width = s.height = 32;
      const g = s.getContext("2d")!;
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.25, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      return s;
    }
    const sprites = colors.map(makeSprite);

    const N = opts.count;
    const parts = Array.from({ length: N }, () => {
      const ang = Math.random() * Math.PI * 2;
      const v = Math.random() ** 2 * (big ? 18 : 13) + 1.5;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(ang) * v * (1 + Math.random() * 0.4),
        vy: Math.sin(ang) * v * (1 + Math.random() * 0.4),
        life: 1,
        decay: 0.005 + Math.random() * 0.014,
        size: (2 + Math.random() * 5) * (opts.scalar ?? 1) * (big ? 2 : 1.6),
        sprite: sprites[(Math.random() * sprites.length) | 0]!,
        drag: 0.982 + Math.random() * 0.012,
      };
    });

    let raf = 0;
    function frame() {
      ctx!.globalCompositeOperation = "destination-out";
      ctx!.fillStyle = "rgba(0,0,0,0.30)";
      ctx!.fillRect(0, 0, cv.width, cv.height);
      ctx!.globalCompositeOperation = "lighter";
      let alive = false;
      for (const p of parts) {
        if (p.life <= 0) continue;
        alive = true;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vy += 0.12;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        const s = p.size * p.life;
        if (s < 0.3) {
          p.life = 0;
          continue;
        }
        ctx!.globalAlpha = Math.min(0.85, p.life * 1.2);
        ctx!.drawImage(p.sprite, p.x - s, p.y - s, s * 2, s * 2);
      }
      ctx!.globalAlpha = 1;
      if (alive) raf = requestAnimationFrame(frame);
      else cv.remove();
    }
    frame();
    return () => cancelAnimationFrame(raf);
  } catch {
    return undefined;
  }
}

function runImpact(refs: StageRefs, tier: AchievementTierLevel) {
  const cfg = IMPACT[tier];
  const t = TIER_CONFIG[tier];
  if (cfg.slashes > 0) fireSlashes(refs, cfg.slashes);
  if (cfg.spark) {
    setTimeout(() => {
      fireSparks(refs, [t.hi, t.tier, "#ffffff", "#ffd166", "#ffedc2"], cfg.spark!);
    }, 240);
  }
  if (cfg.shakeHard) refs.stageEl.classList.add("ro-shake-hard");
}

/** Same cue-sheet pattern as the mockup — one flat, time-ordered list of beats, played back
 *  sorted by `t` regardless of authoring order. See reveal-overlay-notes.md's worked timing
 *  tables if a beat's timing here ever needs to change. */
function buildCueSheet(
  refs: StageRefs,
  tier: AchievementTierLevel,
  setClass: (cls: string, on: boolean) => void,
  onSettle: (() => void) | undefined,
): Cue[] {
  const isImpact = IMPACT_TIERS.has(tier);
  const impactMs = isImpact ? LAND_MS + WINDUP_MS + 140 : LAND_MS + 140;
  const heroZoomMs = isImpact ? impactMs + 10 : LAND_MS - 150;

  const cues: Cue[] = [];

  if (tier === "platinum") {
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

  if (isImpact) {
    cues.push({ t: LAND_MS, run: () => refs.stageEl.classList.add("ro-windup") });
    cues.push({
      t: LAND_MS + WINDUP_MS,
      run: () => {
        refs.stageEl.classList.remove("ro-windup");
        refs.stageEl.classList.add("ro-ring-pop");
        runImpact(refs, tier);
      },
    });
  } else {
    cues.push({ t: LAND_MS, run: () => runImpact(refs, tier) });
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
function pickHero(awards: UnseenAward[]): UnseenAward {
  return [...awards].sort((a, b) => {
    const r = TIER_CONFIG[b.tier].rank - TIER_CONFIG[a.tier].rank;
    if (r !== 0) return r;
    return new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime();
  })[0]!;
}

export interface RevealOverlayProps {
  /** Not required to be pre-sorted — pickHero re-sorts internally. */
  awards: UnseenAward[];
  onDismiss: () => void;
}

export function RevealOverlay({ awards, onDismiss }: RevealOverlayProps): React.JSX.Element | null {
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
  const overflow = rest.length - shown.length;

  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;

  React.useEffect(() => {
    // Every icon here is a bundled Lucide component — nothing to fetch over the network, so
    // "preload" is satisfied by the next paint rather than an Image().onload race. See the file
    // header comment for why this differs from the mockup's real-image preload step.
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  React.useEffect(() => {
    if (!ready || !stageRef.current || !groupRef.current) return;
    const refs: StageRefs = { stageEl: stageRef.current, groupEl: groupRef.current };
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
    );
    playCueSheet(cues, timers);

    return () => timers.forEach((id) => window.clearTimeout(id));
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
    hero.tier === "platinum" ? "ro-platinum-ring" : "",
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
        {hero.tier !== "bronze" && <div className="ro-speedlines" />}
        <div ref={groupRef} className="ro-group">
          <div className="ro-stage-inner">
            <div className="ro-beam" />
            <div className="ro-ring">
              <MedalIcon tier={hero.tier} icon={hero.icon} />
            </div>
            <div className="ro-title-block">
              <h1>{hero.name}</h1>
              <div className="ro-tier-sub">{t.label}</div>
              {rest.length > 0 && (
                <div className={`ro-strip ${stripOpen ? "ro-open" : ""}`}>
                  <div className="ro-strip-inner">
                    <div className="ro-strip-panel">
                      <div className="ro-strip-head">Also earned</div>
                      <div className="ro-strip-row">
                        {shown.map((a, i) => {
                          const at = TIER_CONFIG[a.tier];
                          return (
                            <div
                              key={a.achievementAwardId}
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
                        })}
                        {overflow > 0 && (
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
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="ro-continue">Click or press spacebar to continue</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
