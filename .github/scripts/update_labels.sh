#!/usr/bin/env bash
# Usage: update_labels.sh <pr-number>
# Needs GH_TOKEN and GH_REPO in the environment.
set -euo pipefail
PR="${1:?usage: update_labels.sh <pr-number>}"

gh label create "ready" --color 0e8a16 \
  --description "CI is green and there are no conflicts. Waiting for the owner." --force >/dev/null
gh label create "needs attention" --color d93f0b \
  --description "CI failed or the branch has conflicts." --force >/dev/null

# GitHub computes "mergeable" lazily, so ask again while it says UNKNOWN.
JSON=""
for attempt in 1 2 3 4 5 6; do
  JSON=$(gh pr view "$PR" --json state,isDraft,mergeable,statusCheckRollup)
  if [ "$(jq -r '.mergeable' <<<"$JSON")" != "UNKNOWN" ]; then break; fi
  sleep 10
done

RESULT=$(bash .github/scripts/pr_state.sh <<<"$JSON")
LABELS=$(gh pr view "$PR" --json labels --jq '.labels[].name')

has() { grep -Fxq "$1" <<<"$LABELS"; }
sync() { # sync <label> <yes|no>
  if [ "$2" = yes ] && ! has "$1"; then
    gh pr edit "$PR" --add-label "$1" >/dev/null
  elif [ "$2" = no ] && has "$1"; then
    gh pr edit "$PR" --remove-label "$1" >/dev/null
  fi
}

case "$RESULT" in
  ready)     sync "ready" yes; sync "needs attention" no ;;
  attention) sync "ready" no;  sync "needs attention" yes ;;
  *)         sync "ready" no;  sync "needs attention" no ;;
esac

echo "PR #$PR: $RESULT"
