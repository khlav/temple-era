#!/bin/bash

# Publishes a check run under the Archon GitHub App's own identity, so it
# shows the app's custom avatar in the PR checks list instead of the generic
# Actions icon that "Archon / PR review" (the workflow job itself) gets. A
# GitHub App has no API to reskin an existing Actions-owned check - this is a
# second, separate check run alongside it (TEMPLE-9). GH_TOKEN must be an
# installation token for the Archon app, minted by actions/create-github-app-token
# in the calling step - a plain GITHUB_TOKEN would publish under the generic
# "GitHub Actions" identity, not the app's avatar.

set -euo pipefail

REPO="${REPO:-}"
HEAD_SHA="${HEAD_SHA:-}"
PR_AGENT_OUTCOME="${PR_AGENT_OUTCOME:-}"
DETAILS_URL="${DETAILS_URL:-}"

if [ -z "$REPO" ] || [ -z "$HEAD_SHA" ]; then
    echo "Error: REPO and HEAD_SHA environment variables are required"
    exit 1
fi

# pr_agent's step outcome, not a verdict on the PR's content - Archon doesn't
# gate merges, so "failure" here means the review itself errored (e.g. a
# model API outage), not that the PR has problems.
case "$PR_AGENT_OUTCOME" in
    success)
        CONCLUSION="success"
        TITLE="Review posted"
        SUMMARY="Archon reviewed this PR. See the review comment for findings."
        ;;
    skipped)
        CONCLUSION="neutral"
        TITLE="Skipped"
        SUMMARY="Archon did not run for this PR (bot sender or fork head)."
        ;;
    *)
        CONCLUSION="failure"
        TITLE="Review failed"
        SUMMARY="Archon's review step did not complete. Check the workflow run for details."
        ;;
esac

jq -n \
    --arg name "Archon" \
    --arg head_sha "$HEAD_SHA" \
    --arg conclusion "$CONCLUSION" \
    --arg title "$TITLE" \
    --arg summary "$SUMMARY" \
    --arg details_url "$DETAILS_URL" \
    '{name: $name, head_sha: $head_sha, status: "completed", conclusion: $conclusion,
      details_url: $details_url, output: {title: $title, summary: $summary}}' \
| gh api "repos/$REPO/check-runs" --input -
