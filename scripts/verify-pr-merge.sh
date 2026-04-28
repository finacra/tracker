#!/usr/bin/env bash
# Verify that a squash-merged PR actually landed its diffs on the target branch.
#
# Why: GitHub's squash-merge has silently dropped diffs ~20% of the time on this
# repo when develop carries interleaved `Merge remote-tracking branch 'origin/main'
# into develop` commits (issue #30, PRs #23/#25/#27). The PR shows MERGED, the
# merge commit exists, but `git show <sha>` contains zero of the actual changes.
# This script catches that within seconds of merge instead of days later.
#
# Usage:
#   scripts/verify-pr-merge.sh <PR_NUMBER> [target_branch]
#
# Exits non-zero if any file the PR claimed to change has zero diff lines on
# the target branch's merge commit.

set -euo pipefail

PR_NUMBER="${1:-}"
TARGET_BRANCH="${2:-main}"

if [[ -z "$PR_NUMBER" ]]; then
  echo "usage: $0 <PR_NUMBER> [target_branch]" >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found in PATH" >&2
  exit 2
fi

git fetch origin "$TARGET_BRANCH" --quiet

MERGE_SHA="$(gh pr view "$PR_NUMBER" --json mergeCommit --jq '.mergeCommit.oid')"
if [[ -z "$MERGE_SHA" || "$MERGE_SHA" == "null" ]]; then
  echo "error: PR #$PR_NUMBER has no merge commit (not merged?)" >&2
  exit 1
fi

CHANGED_FILES="$(gh pr view "$PR_NUMBER" --json files --jq '.files[].path')"
if [[ -z "$CHANGED_FILES" ]]; then
  echo "error: PR #$PR_NUMBER reports no changed files" >&2
  exit 1
fi

LANDED_FILES="$(git show --name-only --pretty=format: "$MERGE_SHA" | sed '/^$/d')"

missing=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if ! grep -Fxq "$f" <<<"$LANDED_FILES"; then
    missing+=("$f")
  fi
done <<<"$CHANGED_FILES"

if (( ${#missing[@]} > 0 )); then
  echo "FAIL: PR #$PR_NUMBER merge commit $MERGE_SHA is missing files:"
  printf '  - %s\n' "${missing[@]}"
  echo
  echo "GitHub squash-merge dropped diffs again. Re-open these changes in a follow-up PR."
  echo "See issue #30 and CLAUDE.md Rule 17."
  exit 1
fi

echo "OK: PR #$PR_NUMBER ($MERGE_SHA) landed all $(wc -l <<<"$CHANGED_FILES") files on $TARGET_BRANCH."
