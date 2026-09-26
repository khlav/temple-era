# agent/

Knowledge for **Templar**, the agent that answers raid leads in Discord. Templar and the Temple bot in
`apps/bot` are the same Discord bot user, but they are separate programs: Templar only knows what its
skills tell it. Before this directory existed nothing told it about the bot's features, and it once told
a raid lead "I have no `/sr` command" about a command the same bot runs.

The skills describe **this repo and its tools**, and nothing else. Anything that is about an external
system (ticket filing, internal hostnames, credentials) stays in the agent host's own private skills, not
here. Runtime-specific wiring — which tool makes which call, the agent's persona and response style,
where skills are loaded from — belongs to the host's own configuration, not to these files, so the skills
use plain requests (`GET /raid-plans/{id}?include=characters`) rather than any runtime's tool syntax.

## Layout

```
agent/skills/<skill-name>/SKILL.md     one folder per skill: frontmatter (name, description) + body
agent/deploy/                          how a merge reaches the host; see deploy/README.md
```

- `temple-era` — how to read and write Temple data: GraphQL v2, REST v1 and the read-only SQL connection,
  how to discover what exists (`/api/v1/capabilities`, `/api/v1/endpoints`), and the pitfalls learned so
  far. Its `references/` hold the longer workflows (leaderboards, log audits, roster comparison, …).
- `temple-features` — what the bot and the site do: slash commands, the automatic SoftRes flow, the weekly
  SR admin-token summary, roster forwarding, raid creation from Warcraft Logs links, site pages and who can
  use them.

## Keeping it current

- `temple-features` is updated **in the same PR** as any user-facing change to the bot or the site (a new
  or changed slash command, an automatic behavior, a page, a permission). This is the same rule as the
  `/api/discord/*` contract: the two sides change together.
- `temple-era` is updated in the same PR as a change to what the API exposes (a route, a GraphQL field, a
  table the read-only SQL role can see). `apps/web/src/lib/api-capabilities.ts` is checked against the real
  schema by its test; this skill is prose, so nothing checks it.
- A skill's `name:` frontmatter must equal its folder name — the deploy validates it.

## Getting it onto the host

The host keeps a read-only sparse clone of this repo and loads `agent/skills` as an extra skills directory.
A merge that changes `agent/skills/**` is deployed automatically — pulled, validated, and the gateway
restarted (the skills index is not hot-reloaded). The flow, the one-time host setup, and how to test it are
in [deploy/README.md](deploy/README.md).

A skill with the same name in the host's own profile shadows the one loaded from this directory, so a
skill that moves here has to be removed from the host's local skills.

## Identity note

Add this section to the agent's always-on instructions. It fixes the "that's not me" answers without
loosening the existing rule against describing internals — it names features, not architecture.

```markdown
## The Rest of the Temple Bot
You are one part of the guild's Temple bot. In Discord it is one bot with one name — the features that
run `/sr`, post SR links automatically for new raid signups, keep the weekly SR admin-token summary, and
create raids from Warcraft Logs links are part of the same bot, and users will not tell them apart from
you. You can't run those features or read the channels they post in, but never say "that's not me" or "I
have no such command". Load the `temple-features` skill, explain what happens and where the result lands,
and tell the user which command or page to use. Describe features, never internals.
```
