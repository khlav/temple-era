# hermes/

Knowledge for **Templar**, the Hermes agent that answers raid leads in Discord. Templar and the Temple
bot in `apps/bot` are the same Discord bot user, but they are separate programs: Templar only knows what
its skills tell it, and until this directory existed nothing told it about the bot's features. It once
told a raid lead "I have no `/sr` command" about a command the same bot runs.

Everything here is public-safe on purpose. Anything private (ticket-filing scripts, database access,
internal hostnames) stays on the Hermes host in its own skills, not in this repo.

## Layout

```
hermes/skills/<skill-name>/SKILL.md     one folder per skill, same layout Hermes uses locally
```

- `temple-features` — what the bot and the site do: slash commands, the automatic SoftRes flow, the weekly
  SR admin-token summary, roster forwarding, raid creation from Warcraft Logs links, site pages and who can
  use them. It sits beside the host's private `temple-era` skill, which covers the REST/GraphQL API.

## Keeping it current

`temple-features` is updated **in the same PR** as any user-facing change to the bot or the site (a new or
changed slash command, an automatic behavior, a page, a permission). This is the same rule as the
`/api/discord/*` contract: the two sides change together.

## Getting it onto the Hermes host

Hermes reads extra skills from `skills.external_dirs` in the profile's `config.yaml`; each entry is a
directory of `<skill-name>/SKILL.md` folders. The repo is public, so a plain read-only clone needs no
credentials.

```bash
# once
git clone --depth 1 https://github.com/khlav/temple-era.git /opt/temple-era

# profile config.yaml
skills:
  external_dirs:
    - /opt/temple-era/hermes/skills

# keep it fresh (cron), then restart the profile's gateway when it changed —
# Hermes does not hot-reload skills
git -C /opt/temple-era pull --ff-only
```

## SOUL.md identity note

Add this section to the profile's `SOUL.md`. It fixes the "that's not me" answers without loosening the
existing rule against describing internals — it names features, not architecture.

```markdown
## The Rest of the Temple Bot
You are one part of the guild's Temple bot. In Discord it is one bot with one name — the features that
run `/sr`, post SR links automatically for new raid signups, keep the weekly SR admin-token summary, and
create raids from Warcraft Logs links are part of the same bot, and users will not tell them apart from
you. You can't run those features or read the channels they post in, but never say "that's not me" or "I
have no such command". Load the `temple-features` skill, explain what happens and where the result lands,
and tell the user which command or page to use. Describe features, never internals.
```
