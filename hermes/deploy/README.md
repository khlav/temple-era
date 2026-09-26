# hermes/deploy/

How `hermes/skills/**` reaches the Hermes host without polling. It changes a few times a month, so the
deploy is push-based: nothing runs unless those files change on `main`.

```
merge to main touching hermes/skills/**
  -> .github/workflows/hermes-skills-deploy.yml   (path-filtered; also workflow_dispatch)
  -> generic webhook (.github/scripts/notify-webhook.sh, event hermes_skills_updated)
  -> a dedicated receiving workflow: verify the token, SSH to the host, alert on failure
  -> authorized_keys forced command  ->  update-skills.sh   (on the host)
```

The receiving side is intentionally dumb. The payload is never used: the forced command takes no
arguments and always deploys `main`, so a forged or replayed event can at worst run an idempotent
update.

## update-skills.sh

Fetches `main` into a sparse clone of this repo and, **only if `hermes/skills/**` changed**:

1. validates every skill on the candidate (from git objects, before touching the live checkout) — each
   `hermes/skills/<name>/SKILL.md` needs frontmatter with `name: <name>` and a `description`;
2. checks it out and reloads the gateway (`systemctl reload` → SIGUSR1: drain active conversations,
   then restart);
3. waits for a **new** gateway process that is running and connected to Discord;
4. if that doesn't happen, rolls back to the previous commit and restarts.

The commit the gateway was last started with is recorded separately from the checkout, so a deploy that
is interrupted after the checkout (SSH dropped, script killed) is retried next time rather than
mistaken for "already up to date". Other merges advance the checkout without restarting anything. `update-skills.sh --check` fetches and
reports what it would do, changing nothing live.

| Exit | Meaning |
| ---- | ------- |
| 0 | deployed and healthy, or nothing to do |
| 1 | could not get the update lock |
| 2 | candidate failed validation — nothing changed |
| 3 | gateway unhealthy after the restart — rolled back, healthy again |
| 4 | unhealthy after the restart and the rollback — needs a human |

A full deploy can take a few minutes: drain (up to 90s) + the unit's `RestartSec=60` + startup.

## test-update-skills.sh

Sandbox test that drives the real script through `--check`, deploy, no-op, skills-unchanged advance,
rollback on an unhealthy gateway, and rejection of a broken skill — against a throwaway repo, a fake
`HERMES_HOME` and a stub `systemctl`. It never touches the real gateway. Needs bash, git, python3 and
flock; run it on the host or any Linux box:

```bash
hermes/deploy/test-update-skills.sh
```

## Host setup (once)

```bash
# 1. sparse clone; the repo is public so no credentials are needed
git clone --depth 1 --filter=blob:none --sparse https://github.com/khlav/temple-era.git /opt/temple-era
git -C /opt/temple-era sparse-checkout set hermes/skills hermes/deploy

# 2. install the script where the forced command points
install -m 0755 /opt/temple-era/hermes/deploy/update-skills.sh /usr/local/bin/hermes-skills-update
```

`update-skills.sh` only reaches the host's live checkout through `main`, so a change to the script
itself needs the `install` step re-run by hand.

Point the profile at the clone in its `config.yaml`:

```yaml
skills:
  external_dirs:
    - /opt/temple-era/hermes/skills
```

Add a key for the receiving workflow's SSH step to `~/.ssh/authorized_keys`, locked to the script so even a leaked key
can do nothing else:

```
command="/usr/local/bin/hermes-skills-update",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... hermes-skills-deploy
```

## Receiving side (not in this repo)

A small dedicated workflow: webhook with header auth (bearer token = `HERMES_DEPLOY_WEBHOOK_TOKEN`) →
check `action_type == "hermes_skills_updated"` → SSH step with the key above → on a non-zero exit,
alert. The SSH step's command text is irrelevant (the forced command ignores it).

GitHub repo secrets: `HERMES_DEPLOY_WEBHOOK_URL` and `HERMES_DEPLOY_WEBHOOK_TOKEN`.

## Disabling

Remove the `authorized_keys` line (the deploy stops working immediately) or disable the receiving workflow.
The gateway keeps running the skills it last loaded.
