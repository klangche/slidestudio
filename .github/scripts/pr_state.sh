#!/usr/bin/env bash
# Reads JSON from `gh pr view --json state,isDraft,mergeable,statusCheckRollup` on stdin.
# Prints one word: ready, attention, pending or skip.
set -euo pipefail
JSON=$(cat)

STATE=$(jq -r '.state' <<<"$JSON")
DRAFT=$(jq -r '.isDraft' <<<"$JSON")
MERGEABLE=$(jq -r '.mergeable' <<<"$JSON")

if [ "$STATE" != "OPEN" ] || [ "$DRAFT" = "true" ]; then
  echo skip
  exit 0
fi

FAILED=$(jq '[.statusCheckRollup[]? | select(
  (.__typename == "CheckRun" and .status == "COMPLETED"
    and ((.conclusion // "") as $c | ["SUCCESS","SKIPPED","NEUTRAL"] | index($c) | not))
  or (.__typename == "StatusContext" and (.state == "FAILURE" or .state == "ERROR"))
)] | length' <<<"$JSON")

PENDING=$(jq '[.statusCheckRollup[]? | select(
  (.__typename == "CheckRun" and .status != "COMPLETED")
  or (.__typename == "StatusContext" and (.state == "PENDING" or .state == "EXPECTED"))
)] | length' <<<"$JSON")

TOTAL=$(jq '[.statusCheckRollup[]?] | length' <<<"$JSON")

if [ "$MERGEABLE" = "CONFLICTING" ] || [ "$FAILED" -gt 0 ]; then
  echo attention
elif [ "$PENDING" -gt 0 ] || [ "$TOTAL" -eq 0 ] || [ "$MERGEABLE" != "MERGEABLE" ]; then
  echo pending
else
  echo ready
fi
