"use client";

import * as React from "react";
import { Plus, Shuffle, Trash2, Pencil } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { CharacterSelector } from "~/components/characters/character-selector";
import { ClassIcon } from "~/components/ui/class-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { matchesSearchQuery } from "~/lib/table-search";
import { cn } from "~/lib/utils";
import { getSpellIconUrl } from "~/hooks/use-spell-icon";
import {
  MedalIcon,
  TIER_CONFIG,
  TIER_LABEL,
  type AchievementTierLevel,
} from "~/components/achievements/reveal-overlay";
import type { AdminAchievement, AdminAwardHolder } from "~/server/services/achievement-queries";

const TIERS: AchievementTierLevel[] = ["copper", "silver", "gold", "thorium", "arcanite"];

/** Same footprint as an AchievementChip's icon (ro-icon-sm, 44px) — a preview should look exactly
 *  like the real thing will everywhere else, not a bespoke bigger rendering. */
function MedalPreview({ tier, icon }: { tier: AchievementTierLevel; icon: string }) {
  const colors = TIER_CONFIG[tier];
  return (
    <div
      className="ro-icon-sm relative shrink-0"
      style={{ ["--ro-tier" as string]: colors.tier, ["--ro-hi" as string]: colors.hi }}
    >
      <MedalIcon tier={tier} icon={icon || "inv_misc_questionmark"} />
    </div>
  );
}

/** Plain (untiered) icon thumbnail — used where the icon is being shown for an achievement as a
 *  whole rather than one specific earned tier (the catalog header row spans every tier). */
function IconThumb({ icon }: { icon: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external CDN, not a local asset
    <img
      src={getSpellIconUrl(icon || "inv_misc_questionmark", "medium")}
      alt=""
      className="size-8 shrink-0 rounded-md border border-border object-cover"
    />
  );
}

/** Icon slug entry: free text (anything works, live preview elsewhere catches a bad one), a
 *  server-picked random sample of 20 real icon names, a Randomize button below that grid that
 *  re-rolls it (not the field — the field is only ever set by clicking a tile or a suggestion),
 *  and a type-ahead dropdown (3+ typed characters) of up to 50 server-side matches, scrollable.
 *  The full ~23,500-name catalog never reaches the client — see
 *  achievement.getRandomIcons/searchIcons. */
function IconPickerField({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [focused, setFocused] = React.useState(false);
  const [debouncedQuery, setDebouncedQuery] = React.useState("");

  React.useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(trimmed), 250);
    return () => clearTimeout(timer);
  }, [value]);

  const { data: suggestions } = api.achievement.searchIcons.useQuery(
    { q: debouncedQuery },
    { enabled: debouncedQuery.length >= 3 },
  );
  const {
    data: sampleIcons,
    refetch: rerollSamples,
    isFetching: isRerolling,
  } = api.achievement.getRandomIcons.useQuery({ count: 20 });

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">Icon</label>
      <div className="relative">
        <Input
          placeholder="WoW icon slug, e.g. inv_sword_04"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {focused && suggestions && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            {suggestions.map((slug) => (
              <button
                key={slug}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(slug);
                  setFocused(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- external CDN thumbnail */}
                <img
                  src={getSpellIconUrl(slug, "small")}
                  alt=""
                  className="size-5 shrink-0 rounded-sm object-cover"
                />
                <span className="truncate">{slug}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(sampleIcons ?? []).map((slug) => (
          <button
            key={slug}
            type="button"
            title={slug}
            onClick={() => onChange(slug)}
            className="size-8 overflow-hidden rounded-md border border-border opacity-80 transition-opacity hover:opacity-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external CDN preset thumbnail */}
            <img
              src={getSpellIconUrl(slug, "medium")}
              alt={slug}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void rerollSamples()}
        disabled={isRerolling}
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <Shuffle className="size-3" /> Randomize examples
      </button>
    </div>
  );
}

// ─── Create ─────────────────────────────────────────────────────────────────────

function CreateAchievementDialog() {
  const utils = api.useUtils();
  const { data: season } = api.achievement.getCurrentSeason.useQuery();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [icon, setIcon] = React.useState("");
  const [tier, setTier] = React.useState<AchievementTierLevel>("copper");
  const [allTime, setAllTime] = React.useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setIcon("");
    setTier("copper");
    setAllTime(false);
  };

  const createAchievement = api.achievement.createAchievement.useMutation({
    onSuccess: () => {
      void utils.achievement.getAdminCatalog.invalidate();
      reset();
      setOpen(false);
    },
  });

  const canSubmit = name.trim().length > 0 && icon.trim().length > 0 && (allTime || !!season);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          createAchievement.reset();
        }
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 size-4" /> New achievement
      </Button>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New custom achievement</DialogTitle>
          <DialogDescription>
            Manual-grant only — no rule ever awards this automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g. Hall of Fame"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                placeholder="Shown in the reveal + tooltip"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <IconPickerField value={icon} onChange={setIcon} />
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm font-medium">Tier</label>
                <Select value={tier} onValueChange={(v) => setTier(v as AchievementTierLevel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIER_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={allTime} onCheckedChange={(v) => setAllTime(v === true)} />
              All-time (not scoped to {season?.name ?? "the current season"})
            </label>
            <p className="text-xs text-muted-foreground">
              Custom achievements are always secret until earned.
            </p>
            {!allTime && !season && (
              <p className="text-sm text-destructive">
                No season is configured — mark this all-time or set up a season first.
              </p>
            )}
          </div>

          <div className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-lg border border-dashed border-border p-3 text-center">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Preview
            </span>
            <MedalPreview tier={tier} icon={icon} />
            <span className="text-xs font-semibold leading-tight">
              {name || "Achievement name"}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {TIER_LABEL[tier]}
            </span>
          </div>
        </div>

        {createAchievement.error && (
          <p className="text-sm text-destructive">{createAchievement.error.message}</p>
        )}

        <DialogFooter>
          <Button
            disabled={!canSubmit || createAchievement.isPending}
            onClick={() =>
              createAchievement.mutate({
                name: name.trim(),
                description: description.trim() || null,
                icon: icon.trim(),
                tier,
                scope: allTime ? "all_time" : "season",
                seasonId: allTime ? null : (season?.id ?? null),
              })
            }
          >
            Create achievement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit ───────────────────────────────────────────────────────────────────────

/** Same field set as CreateAchievementDialog, prefilled from the achievement being edited.
 *  Custom-only, enforced server-side (updateAchievement rejects a rule-based achievementId) —
 *  the trigger for this dialog only ever appears in CustomAchievementsSection, so there's no
 *  client-side gate to duplicate here. */
function EditAchievementDialog({
  achievement,
  onClose,
}: {
  achievement: AdminAchievement;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const { data: season } = api.achievement.getCurrentSeason.useQuery();
  const [name, setName] = React.useState(achievement.name);
  const [description, setDescription] = React.useState(achievement.description ?? "");
  const [icon, setIcon] = React.useState(achievement.icon);
  const [tier, setTier] = React.useState<AchievementTierLevel>(
    achievement.tiers[0]?.tier ?? "copper",
  );
  const [allTime, setAllTime] = React.useState(achievement.scope === "all_time");

  const updateAchievement = api.achievement.updateAchievement.useMutation({
    onSuccess: () => {
      void utils.achievement.getAdminCatalog.invalidate();
      onClose();
    },
  });

  const canSubmit = name.trim().length > 0 && icon.trim().length > 0 && (allTime || !!season);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit custom achievement</DialogTitle>
          <DialogDescription>
            Existing awards keep whatever tier they were granted at — this only changes the
            definition going forward.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                placeholder="Shown in the reveal + tooltip"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <IconPickerField value={icon} onChange={setIcon} />
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm font-medium">Tier</label>
                <Select value={tier} onValueChange={(v) => setTier(v as AchievementTierLevel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIER_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={allTime} onCheckedChange={(v) => setAllTime(v === true)} />
              All-time (not scoped to {season?.name ?? "the current season"})
            </label>
            {!allTime && !season && (
              <p className="text-sm text-destructive">
                No season is configured — mark this all-time or set up a season first.
              </p>
            )}
          </div>

          <div className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-lg border border-dashed border-border p-3 text-center">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Preview
            </span>
            <MedalPreview tier={tier} icon={icon} />
            <span className="text-xs font-semibold leading-tight">
              {name || "Achievement name"}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {TIER_LABEL[tier]}
            </span>
          </div>
        </div>

        {updateAchievement.error && (
          <p className="text-sm text-destructive">{updateAchievement.error.message}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || updateAchievement.isPending}
            onClick={() =>
              updateAchievement.mutate({
                achievementId: achievement.achievementId,
                name: name.trim(),
                description: description.trim() || null,
                icon: icon.trim(),
                tier,
                scope: allTime ? "all_time" : "season",
                seasonId: allTime ? null : (season?.id ?? null),
              })
            }
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete achievement ─────────────────────────────────────────────────────────

function DeleteAchievementConfirmDialog({
  achievement,
  onClose,
}: {
  achievement: AdminAchievement;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const holderCount = achievement.tiers.reduce((sum, t) => sum + t.holders.length, 0);
  const deleteAchievement = api.achievement.deleteAchievement.useMutation({
    onSuccess: () => {
      void utils.achievement.getAdminCatalog.invalidate();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete achievement</DialogTitle>
          <DialogDescription>
            Permanently delete &ldquo;{achievement.name}&rdquo;
            {holderCount > 0
              ? ` — ${holderCount} character${holderCount === 1 ? "" : "s"} currently hold it and will lose it`
              : ""}
            ? This deletes the definition itself, not just their awards — it won&apos;t be grantable
            to anyone else afterward. Can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {deleteAchievement.error && (
          <p className="text-sm text-destructive">{deleteAchievement.error.message}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteAchievement.isPending}
            onClick={() => deleteAchievement.mutate({ achievementId: achievement.achievementId })}
          >
            Delete achievement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Grant ──────────────────────────────────────────────────────────────────────

function GrantDialog({
  achievementTierId,
  name,
  icon,
  tier,
  onClose,
}: {
  achievementTierId: string;
  name: string;
  icon: string;
  tier: AchievementTierLevel;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const [selectedCharacter, setSelectedCharacter] = React.useState<{
    characterId: number;
    name: string;
    class: string;
  } | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const grantAchievement = api.achievement.grantAchievement.useMutation({
    onSuccess: () => {
      void utils.achievement.getAdminCatalog.invalidate();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant achievement</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <MedalPreview tier={tier} icon={icon} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{name}</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {TIER_LABEL[tier]}
            </span>
          </div>
        </div>

        <CharacterSelector
          characterSet="primary"
          onSelectAction={(c) => {
            setSelectedCharacter({ characterId: c.characterId, name: c.name, class: c.class });
            setConfirming(false);
          }}
          buttonContent={
            selectedCharacter ? (
              <div className="flex items-center gap-2">
                <ClassIcon characterClass={selectedCharacter.class} px={16} />
                {selectedCharacter.name}
              </div>
            ) : (
              "Pick a character"
            )
          }
        />

        {grantAchievement.error && (
          <p className="text-sm text-destructive">{grantAchievement.error.message}</p>
        )}

        <DialogFooter>
          {confirming && selectedCharacter ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Back
              </Button>
              <Button
                disabled={grantAchievement.isPending}
                onClick={() =>
                  grantAchievement.mutate({
                    achievementTierId,
                    primaryCharacterId: selectedCharacter.characterId,
                  })
                }
              >
                Confirm grant to {selectedCharacter.name}
              </Button>
            </>
          ) : (
            <Button disabled={!selectedCharacter} onClick={() => setConfirming(true)}>
              Grant
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Custom achievements ──────────────────────────────────────────────────────

function CustomAchievementsSection({ catalog }: { catalog: AdminAchievement[] | undefined }) {
  const [grantTarget, setGrantTarget] = React.useState<{
    achievementTierId: string;
    name: string;
    icon: string;
    tier: AchievementTierLevel;
  } | null>(null);
  const [editTarget, setEditTarget] = React.useState<AdminAchievement | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminAchievement | null>(null);

  const custom = (catalog ?? []).filter((a) => a.ruleShape === null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Custom Achievements</CardTitle>
          <CardDescription>Manually-granted awards with no rule attached.</CardDescription>
        </div>
        <CreateAchievementDialog />
      </CardHeader>
      <CardContent>
        {custom.length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom achievements yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/70">
            {custom.flatMap((achievement) =>
              achievement.tiers.map((tier) => (
                <div
                  key={tier.achievementTierId}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <MedalPreview tier={tier.tier} icon={achievement.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{achievement.name}</span>
                      <Badge variant="secondary">{TIER_LABEL[tier.tier]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {achievement.scope === "season" ? "In-Season" : "All-time"}
                      </span>
                    </div>
                    {achievement.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {achievement.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{tier.holders.length} held</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setGrantTarget({
                        achievementTierId: tier.achievementTierId,
                        name: achievement.name,
                        icon: achievement.icon,
                        tier: tier.tier,
                      })
                    }
                  >
                    Grant
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Edit ${achievement.name}`}
                    onClick={() => setEditTarget(achievement)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Delete ${achievement.name}`}
                    className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                    onClick={() => setDeleteTarget(achievement)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )),
            )}
          </div>
        )}
      </CardContent>

      {grantTarget && (
        <GrantDialog
          achievementTierId={grantTarget.achievementTierId}
          name={grantTarget.name}
          icon={grantTarget.icon}
          tier={grantTarget.tier}
          onClose={() => setGrantTarget(null)}
        />
      )}
      {editTarget && (
        <EditAchievementDialog achievement={editTarget} onClose={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteAchievementConfirmDialog
          achievement={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </Card>
  );
}

// ─── Revoke ─────────────────────────────────────────────────────────────────────

function RevokeConfirmDialog({
  holder,
  achievementName,
  tier,
  onClose,
}: {
  holder: AdminAwardHolder;
  achievementName: string;
  tier: AchievementTierLevel;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const revokeAward = api.achievement.revokeAward.useMutation({
    onSuccess: () => {
      void utils.achievement.getAdminCatalog.invalidate();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke achievement</DialogTitle>
          <DialogDescription>
            Remove &ldquo;{achievementName}&rdquo; from {holder.characterName} entirely?
            They&apos;re currently shown at {TIER_LABEL[tier]} — this revokes every tier
            they&apos;ve earned for this achievement, not just that one. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {holder.source === "rule" && (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            This was earned automatically. If {holder.characterName} still meets the criteria, the
            rule engine will re-grant it the next time it evaluates.
          </p>
        )}
        {revokeAward.error && (
          <p className="text-sm text-destructive">{revokeAward.error.message}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={revokeAward.isPending}
            onClick={() => revokeAward.mutate({ achievementAwardId: holder.achievementAwardId })}
          >
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Catalog ────────────────────────────────────────────────────────────────────

/** One block per achievement: icon+name (and its scope/custom/hidden badges) as a narrow left
 *  column — the name wraps rather than truncating, since "Steadfast" and "There's grass to touch
 *  in Azeroth" share the same column width — with a mini two-column table to its right, one row
 *  per tier that has at least one holder: medal + holder count top-aligned in a fixed-width left
 *  cell, that tier's holder chips wrapping in the cell beside it, and a light horizontal divider
 *  between tier rows. When `searchTerms` matches individual holder names, non-matching holder
 *  chips fade and matching ones get a highlighted border, so a name search reads at a glance even
 *  on an achievement whose row is showing because a *different* holder (or the achievement name
 *  itself) matched. */
function CatalogRow({
  achievement,
  searchTerms,
  onRevoke,
}: {
  achievement: AdminAchievement;
  searchTerms: string;
  onRevoke: (holder: AdminAwardHolder, tier: AchievementTierLevel) => void;
}) {
  // Rarest first — arcanite down to copper, whichever tiers actually have holders.
  const tiersWithHolders = achievement.tiers
    .filter((t) => t.holders.length > 0)
    .slice()
    .reverse();
  const hasSearch = searchTerms.trim().length > 0;

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex w-40 shrink-0 flex-col gap-1">
        <div className="flex items-start gap-2">
          <IconThumb icon={achievement.icon} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold leading-snug">{achievement.name}</span>
              {achievement.ruleShape === null && <Badge variant="secondary">Custom</Badge>}
            </div>
            <span className="text-xs text-muted-foreground">
              {achievement.scope === "season" ? "In-Season" : "All-time"}
            </span>
          </div>
        </div>
        {achievement.tiers[0]?.description && (
          <p className="text-xs text-muted-foreground">{achievement.tiers[0].description}</p>
        )}
      </div>

      {tiersWithHolders.length === 0 ? (
        <span className="text-xs text-muted-foreground">No holders yet</span>
      ) : (
        <div className="flex flex-1 flex-col divide-y divide-border/50">
          {tiersWithHolders.map((tier) => (
            <div
              key={tier.achievementTierId}
              className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
            >
              <div className="flex w-14 shrink-0 flex-col items-center gap-0.5">
                {tier.description ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MedalPreview tier={tier.tier} icon={achievement.icon} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-64 bg-secondary text-center text-muted-foreground"
                    >
                      {tier.description}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <MedalPreview tier={tier.tier} icon={achievement.icon} />
                )}
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {tier.holders.length}
                </span>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-1.5 pt-1">
                {tier.holders.map((holder) => {
                  const nameMatches =
                    hasSearch && matchesSearchQuery(holder.characterName, searchTerms);
                  return (
                    <span
                      key={holder.achievementAwardId}
                      className={cn(
                        "flex items-center gap-1 rounded-full border bg-card/60 py-0.5 pl-1.5 pr-1 text-xs transition-opacity",
                        nameMatches
                          ? "border-primary"
                          : hasSearch
                            ? "border-border/70 opacity-40"
                            : "border-border/70",
                      )}
                    >
                      <ClassIcon characterClass={holder.characterClass} px={14} />
                      {holder.characterName}
                      <button
                        type="button"
                        title="Revoke"
                        onClick={() => onRevoke(holder, tier.tier)}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Same four-way split the public Achievements page uses (achievement-display.tsx) — Classes is
// the 8 class-attendance achievements (identified by ruleShape, same as there), Tradeskill is the
// 8 profession-mastery achievements (ruleShape, same as there — visible, not part of the hidden
// bucket), Secret is `achievement.hidden` OR custom (ruleShape === null — createAchievement always
// forces hidden:true, but the grouping checks ruleShape directly too rather than trusting that
// invariant to hold forever), Core is everything else. Kept in sync deliberately: an admin
// scanning this table should recognize the same grouping they'd see on the player-facing page.
function groupCatalog(achievements: AdminAchievement[]) {
  const core: AdminAchievement[] = [];
  const classes: AdminAchievement[] = [];
  const tradeskill: AdminAchievement[] = [];
  const secret: AdminAchievement[] = [];
  for (const achievement of achievements) {
    if (achievement.ruleShape === "recipe_set_threshold") tradeskill.push(achievement);
    else if (achievement.hidden || achievement.ruleShape === null) secret.push(achievement);
    else if (achievement.ruleShape === "class_attendance_threshold") classes.push(achievement);
    else core.push(achievement);
  }
  return { core, classes, tradeskill, secret };
}

function CatalogGroup({
  title,
  showTitle = true,
  achievements,
  searchTerms,
  onRevoke,
}: {
  title: string;
  showTitle?: boolean;
  achievements: AdminAchievement[];
  searchTerms: string;
  onRevoke: (holder: AdminAwardHolder, tier: AchievementTierLevel, achievementName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {showTitle && (
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
      )}
      <div className="flex flex-col divide-y divide-border/60">
        {achievements.map((achievement) => (
          <CatalogRow
            key={achievement.achievementId}
            achievement={achievement}
            searchTerms={searchTerms}
            onRevoke={(holder, tier) => onRevoke(holder, tier, achievement.name)}
          />
        ))}
      </div>
    </div>
  );
}

type CatalogTab = "all" | "core" | "classes" | "tradeskill" | "secret";

function CatalogSection({
  catalog,
  isLoading,
}: {
  catalog: AdminAchievement[] | undefined;
  isLoading: boolean;
}) {
  const [searchTerms, setSearchTerms] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<CatalogTab>("all");
  const [revokeTarget, setRevokeTarget] = React.useState<{
    holder: AdminAwardHolder;
    achievementName: string;
    tier: AchievementTierLevel;
  } | null>(null);
  const { data: season } = api.achievement.getCurrentSeason.useQuery();

  const filtered = (catalog ?? []).filter((a) => {
    if (!searchTerms.trim()) return true;
    const searchable = [
      a.name,
      ...a.tiers.flatMap((t) => t.holders.map((h) => h.characterName)),
    ].join(" ");
    return matchesSearchQuery(searchable, searchTerms);
  });
  const { core, classes, tradeskill, secret } = groupCatalog(filtered);
  const handleRevoke = (
    holder: AdminAwardHolder,
    tier: AchievementTierLevel,
    achievementName: string,
  ) => setRevokeTarget({ holder, achievementName, tier });

  const showCore = activeTab === "all" || activeTab === "core";
  const showClasses = activeTab === "all" || activeTab === "classes";
  const showSecret = activeTab === "all" || activeTab === "secret";
  const showTradeskill = activeTab === "all" || activeTab === "tradeskill";
  const nothingInTab =
    (showCore && core.length > 0) ||
    (showClasses && classes.length > 0) ||
    (showSecret && secret.length > 0) ||
    (showTradeskill && tradeskill.length > 0)
      ? false
      : true;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {season ? `${season.name} Achievement Catalog` : "Achievement Catalog"}
        </CardTitle>
        <CardDescription>Every achievement and tier, and who currently holds it.</CardDescription>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <TableSearchInput
            placeholder="Search achievements or character names..."
            defaultValue={searchTerms}
            onDebouncedChange={setSearchTerms}
            className="max-w-sm"
          />
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CatalogTab)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="core">Core</TabsTrigger>
              <TabsTrigger value="classes">Classes</TabsTrigger>
              <TabsTrigger value="tradeskill">Tradeskill</TabsTrigger>
              <TabsTrigger value="secret">Legendary Feats</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No achievements match.</p>
        )}
        {!isLoading && filtered.length > 0 && nothingInTab && (
          <p className="text-sm text-muted-foreground">No achievements in this group.</p>
        )}
        <div className="flex flex-col gap-5">
          {showCore && core.length > 0 && (
            <CatalogGroup
              title="Core"
              showTitle={activeTab === "all"}
              achievements={core}
              searchTerms={searchTerms}
              onRevoke={handleRevoke}
            />
          )}
          {showClasses && classes.length > 0 && (
            <CatalogGroup
              title="Classes"
              showTitle={activeTab === "all"}
              achievements={classes}
              searchTerms={searchTerms}
              onRevoke={handleRevoke}
            />
          )}
          {showTradeskill && tradeskill.length > 0 && (
            <CatalogGroup
              title="Tradeskill"
              showTitle={activeTab === "all"}
              achievements={tradeskill}
              searchTerms={searchTerms}
              onRevoke={handleRevoke}
            />
          )}
          {showSecret && secret.length > 0 && (
            <CatalogGroup
              title="Legendary Feats"
              showTitle={activeTab === "all"}
              achievements={secret}
              searchTerms={searchTerms}
              onRevoke={handleRevoke}
            />
          )}
        </div>
      </CardContent>

      {revokeTarget && (
        <RevokeConfirmDialog
          holder={revokeTarget.holder}
          achievementName={revokeTarget.achievementName}
          tier={revokeTarget.tier}
          onClose={() => setRevokeTarget(null)}
        />
      )}
    </Card>
  );
}

// ─── Root ───────────────────────────────────────────────────────────────────────

export function AchievementAdminPanel() {
  const { data: catalog, isLoading } = api.achievement.getAdminCatalog.useQuery();

  return (
    <div className="flex flex-col gap-6">
      <CustomAchievementsSection catalog={catalog} />
      <CatalogSection catalog={catalog} isLoading={isLoading} />
    </div>
  );
}
