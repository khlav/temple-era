"use client";

import * as React from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { CharacterSelector } from "~/components/characters/character-selector";
import { ClassIcon } from "~/components/ui/class-icon";

const TIERS = ["bronze", "silver", "gold", "platinum"] as const;

function CreateSeasonForm() {
  const utils = api.useUtils();
  const [name, setName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  const createSeason = api.achievement.createSeason.useMutation({
    onSuccess: () => {
      void utils.achievement.listSeasons.invalidate();
      setName("");
      setStartDate("");
      setEndDate("");
    },
  });

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <h3 className="text-sm font-medium">New season</h3>
      <Input
        placeholder="Season name (e.g. Season 2)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex gap-2">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="End (optional)"
        />
      </div>
      <Button
        size="sm"
        disabled={!name || !startDate || createSeason.isPending}
        onClick={() =>
          createSeason.mutate({
            name,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
          })
        }
      >
        Create season
      </Button>
      {createSeason.error && (
        <p className="text-sm text-destructive">{createSeason.error.message}</p>
      )}
    </div>
  );
}

function CreateAchievementForm() {
  const utils = api.useUtils();
  const { data: seasonsList } = api.achievement.listSeasons.useQuery();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [icon, setIcon] = React.useState("");
  const [tier, setTier] = React.useState<(typeof TIERS)[number]>("bronze");
  const [scope, setScope] = React.useState<"season" | "all_time">("season");
  const [seasonId, setSeasonId] = React.useState<string | undefined>(undefined);
  const [hidden, setHidden] = React.useState(false);

  const createAchievement = api.achievement.createAchievement.useMutation({
    onSuccess: () => {
      void utils.achievement.listAchievements.invalidate();
      setName("");
      setDescription("");
      setIcon("");
      setHidden(false);
    },
  });

  const canSubmit = name && icon && (scope === "all_time" || seasonId);

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <h3 className="text-sm font-medium">New custom achievement</h3>
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        placeholder="Icon (lucide name or asset ref)"
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
      />
      <div className="flex gap-2">
        <Select value={tier} onValueChange={(v) => setTier(v as (typeof TIERS)[number])}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            {TIERS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={(v) => setScope(v as "season" | "all_time")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="season">Season</SelectItem>
            <SelectItem value="all_time">All-time</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {scope === "season" && (
        <Select value={seasonId} onValueChange={setSeasonId}>
          <SelectTrigger>
            <SelectValue placeholder="Season" />
          </SelectTrigger>
          <SelectContent>
            {seasonsList?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={hidden} onCheckedChange={(v) => setHidden(v === true)} />
        Hidden until first earned
      </label>
      <Button
        size="sm"
        disabled={!canSubmit || createAchievement.isPending}
        onClick={() =>
          createAchievement.mutate({
            name,
            description: description || null,
            icon,
            tier,
            scope,
            seasonId: scope === "season" ? seasonId : null,
            hidden,
          })
        }
      >
        Create achievement
      </Button>
      {createAchievement.error && (
        <p className="text-sm text-destructive">{createAchievement.error.message}</p>
      )}
    </div>
  );
}

function GrantSection() {
  const utils = api.useUtils();
  const { data: achievementsList } = api.achievement.listAchievements.useQuery();
  const [achievementTierId, setAchievementTierId] = React.useState<string | undefined>(undefined);
  const [selectedCharacter, setSelectedCharacter] = React.useState<{
    characterId: number;
    name: string;
    class: string;
  } | null>(null);

  const manualTiers = (achievementsList ?? []).flatMap((a) =>
    a.tiers.filter((t) => t.ruleConfig === null).map((t) => ({ ...t, achievementName: a.name })),
  );

  const grantAchievement = api.achievement.grantAchievement.useMutation({
    onSuccess: () => {
      void utils.achievement.listAwardsForFamily.invalidate();
      setSelectedCharacter(null);
    },
  });

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <h3 className="text-sm font-medium">Grant a custom achievement</h3>
      <Select value={achievementTierId} onValueChange={setAchievementTierId}>
        <SelectTrigger>
          <SelectValue placeholder="Achievement (tier)" />
        </SelectTrigger>
        <SelectContent>
          {manualTiers.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.achievementName} — {t.tier}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CharacterSelector
        characterSet="primary"
        onSelectAction={(c) =>
          setSelectedCharacter({ characterId: c.characterId, name: c.name, class: c.class })
        }
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
      <Button
        size="sm"
        disabled={!achievementTierId || !selectedCharacter || grantAchievement.isPending}
        onClick={() =>
          achievementTierId &&
          selectedCharacter &&
          grantAchievement.mutate({
            achievementTierId,
            primaryCharacterId: selectedCharacter.characterId,
          })
        }
      >
        Grant
      </Button>
      {grantAchievement.error && (
        <p className="text-sm text-destructive">{grantAchievement.error.message}</p>
      )}
    </div>
  );
}

export function AchievementAdminPanel() {
  const { data: achievementsList, isLoading } = api.achievement.listAchievements.useQuery();

  return (
    <div className="flex flex-col gap-4">
      <CreateSeasonForm />
      <CreateAchievementForm />
      <GrantSection />

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Achievements</h3>
        {isLoading && "Loading..."}
        {achievementsList && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Tiers</TableHead>
                <TableHead>Hidden</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {achievementsList.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>
                    {a.scope === "season" ? (a.season?.name ?? "season") : "all-time"}
                  </TableCell>
                  <TableCell>{a.tiers.map((t) => t.tier).join(", ")}</TableCell>
                  <TableCell>{a.hidden ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
