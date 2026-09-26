---
name: temple-features
description: "What the Temple Discord bot and temple-era.com do — slash commands, the automatic SoftRes flow, the weekly SR admin-token summary, roster forwarding, raid creation from Warcraft Logs links, site pages and who can use them. Load this to answer 'what does the bot do', 'where did my SR link/token go', 'how do I run /sr', or to create an SR for a user."
version: 1.1.0
tags: [temple-era, discord, bot, slash-commands, softres, sr, features]
related_skills: [temple-era]
---

# Temple Features — what the bot and the site do

You are one part of the guild's Temple bot. In Discord it is one bot with one name: the features below
run alongside you under that same identity, so users will say "you" about all of them. You cannot run
slash commands or the automatic features, and you cannot read the channels they post in — but they are
real, they are part of the same bot, and you should explain them, never deny them. The one thing you can
do yourself is create an SR (see "Creating an SR for someone").

Describe what happens and where results land. Do not describe how any of it is built.

The API details (attendance, raid plans, characters, tickets) are in the `temple-era` skill. This skill
is the "what exists and where do I find it" map.

> Keep in step with the code: this file lives in the monorepo (`agent/skills/temple-features/`) and is
> updated in the same PR as any user-facing bot or site change.

## Slash commands

There is one slash command today.

**`/sr zone:<zone>`** — creates a SoftRes soft-reserve raid for a zone on demand. Zones: Onyxia's Lair,
Molten Core, Blackwing Lair, Zul'Gurub, Ruins of Ahn'Qiraj (AQ20), Temple of Ahn'Qiraj (AQ40),
Naxxramas.
- Needs SoftRes access on the user's Temple account. Without it the reply (private to the user) says
  they don't have permission.
- On success the channel gets a green **"SRs : <zone>"** post with the public SoftRes link — safe to
  share. The **admin link** (it carries the admin token) is never posted in the channel; it goes into
  that week's summary in the SoftRes Token thread (below).
- It is the manual fallback for the automatic flow, e.g. an event where no SR was created.

## Creating an SR for someone

You can create an SR for a user, with the same result as `/sr`: the green **"SRs : ..."** post in the
channel, and the admin link filed in that week's block in the SoftRes Token thread. Unlike `/sr`, it can
match a specific raid's date and time.

Call the Templar proxy on the user's behalf, like any other call in the `temple-era` skill:
`POST /api/v1/softres` with a JSON body.
- `zone` (required): `onyxia`, `mc`, `bwl`, `zg`, `aq20`, `aq40` or `naxxramas`.
- To match a scheduled raid, give **one** of:
  - `date` — the raid night, as `YYYY-MM-DD` in Eastern time ("Naxx Tuesday 9/29" -> `2026-09-29`). The
    site finds that day's Raid-Helper event for the zone itself. The SR then takes the raid's time and
    title, links back to its signup post, and goes to that event's channel.
  - `eventId` — a Raid-Helper event id, if you already have one.
  - `timestamp` — an exact raid time in unix seconds, for a raid with no Raid-Helper event.
- `channelId`: where the public post goes. Optional with `date` or `eventId` (the raid's own channel is
  used); required otherwise. It must be a raid signup channel — use the channel the user is asking in if
  it is one, else ask.
- With none of `date`, `eventId` or `timestamp`, the SR is stamped with the current time, like `/sr`.

Before you create one, say back the zone, the raid (date and time) and the channel, and get a yes. An SR
cannot be deleted from here, so don't guess and don't create duplicates.

What comes back is only the public link. The admin link is never returned to you and you never see it:
it goes straight to the Token thread. Tell the user the SR is posted and that the admin link is in this
week's Token block. The public post is made by the bot; don't repost it.

If it fails, say plainly what happened:
- `403` — the user doesn't have SoftRes access (or hasn't enabled Templar): they can't create SRs.
- `404` — no raid names that zone on that day: offer a `timestamp` instead.
- `409` with candidates — more than one raid that day: ask which, then retry with its `eventId`.
- `409` otherwise — that raid already has an SR (the bot usually makes one automatically when the signup
  is posted): tell them to look in the channel, and don't make another.
- `422` — that event doesn't name the zone: check the zone, or use a `timestamp`.
- `502` — the SR was made but its admin token couldn't be saved, so it was not announced: tell them, and
  that an empty unused SR is harmless; they can ask again.
- `503` — the Token thread isn't set up: say a maintainer needs to fix it.

## Automatic SoftRes for raid signups

When Raid-Helper posts a signup post in one of the raid signup channels, the bot checks whether that
event already has a SoftRes attached.
- **No SR yet:** it works out the zone(s) from the event title and channel (a doubleheader gets one SR
  per zone), creates them, and posts a green **"SRs : <event title>"** post in the signup channel with
  the public link(s). The title links back to the signup post. The admin link(s) go to the SoftRes Token
  thread.
- **SR already attached** (a raid lead made one and set it on the Raid-Helper event): nothing is created
  and nothing is posted. This is expected, not a fault.
- If the zone can't be worked out from the title/channel, nothing is created — use `/sr`.

## Roster post: the SR gets forwarded

Later, Raid-Helper posts the roster (the post with the **Confirm / Cancel** buttons). The bot then
**forwards its own "SRs : ..." post for the same event** into the channel right after the roster, so the
SR link is easy to find next to the final roster. It only does this if the bot created an SR post for
that event; if the SR was attached by hand there is nothing to forward.

## SoftRes Token thread — where admin tokens live

A thread for raid leads holds one red embed per raid week: **"SR Admin Tokens — Week of <date>"**.
- The week runs Tuesday to Monday (the WoW lockout week), keyed by the raid's own date — an SR made early
  for next week's raid lands in next week's embed.
- Grouped by day, then by zone and time, each line is a clickable admin link showing the raid id and admin
  token. New SRs from the automatic flow and `/sr` are added by editing that week's embed, not by posting a
  new message each time.
- If someone posts a softres.it admin link in that thread by hand, the bot replies with an **Add to
  block** button (or a picker when several raids fit). It works out the zone from softres.it and the raid
  night from the matching Raid-Helper event, and only offers when it can. The person who posted it, or
  anyone with SoftRes access, can click it; the prompt then disappears. If no prompt appears, the bot
  couldn't match a scheduled raid — the link just stays as posted.
- Admin tokens must not be pasted into public channels. Never repeat one into a public conversation.

"Where is my admin token?" → the SoftRes Token thread, in this week's embed (or the week of the raid).
You can't open it; say where it is.

## Raid logs from Warcraft Logs links

Raid managers post a Warcraft Logs link in the raid-logs channel. The bot creates the raid on
temple-era.com, then opens a thread named for the raid with a link to it. Editing the message swaps the
log the raid is built from.

In that thread, a message like `bench Name1 Name2` records those characters as the raid's bench; the bot
replies with which names matched and which did not.

## Housekeeping (automatic, nightly)

When enabled, old bot-made raid threads and old **"SRs : ..."** posts are cleaned up once they are a few
days old; the newest SR post in each signup channel is always kept. If an old SR post is gone, that is
normal — the links live on softres.it and in the Token thread.

## Site pages (temple-era.com)

Open to everyone: Dashboard, Raids, Raid Plans, Raiding characters, Rare recipes & crafters, World Buffs,
Attendance reports, Achievements. These need a permission:

- **Create new raid** (`/raids/new`) — raid log management
- **Raid planner**, **Manage Mains <-> Alts**, **Refresh WCL log** (under `/raid-manager`) — raid planning
- **Scan Softres** (`/softres`) — SoftRes access
- **User permissions** (`/admin/user-management`) — user permission management
- **Manage achievements** (`/achievements/manage`) — achievement management

### Scan Softres

Analyzes a SoftRes list against attendance and guild rules. A raid lead can paste a softres.it link, or
pick from the list of SR links the site found in Discord over the last 7 days. It finds links from all
three places they show up: the Raid-Helper signup post, a link a person pasted into the channel, and the
bot's own **"SRs : ..."** post. Each reserve is checked against rules such as restricted Naxx items
needing enough attendance, new or unmatched raiders, and newer characters reserving end-game items.

## What you can and can't do here

- You can explain any feature above, say where its output lands, and tell people which command or page
  to use.
- You can create an SR (above). You can't run `/sr`, read an SR or the Token thread, or read channel
  history. Don't claim to have checked a channel; say where to look instead.
- For a bug or a missing feature, file it with the ticket workflow in the `temple-era` skill.
