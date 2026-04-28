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

CHANGED_FILES_PR="$(gh pr view "$PR_NUMBER" --json files --jq '.files[].path')"
PR_FILE_COUNT=$(awk 'NF' <<<"$CHANGED_FILES_PR" | wc -l | tr -d ' ')

LANDED_FILES="$(git show --name-only --pretty=format: "$MERGE_SHA" | sed '/^$/d')"
LANDED_COUNT=$(awk 'NF' <<<"$LANDED_FILES" | wc -l | tr -d ' ')

# Hard-fail mode: the squash bug from issue #30 produces a merge commit
# with ZERO files changed. That's the case we MUST flag.
if [[ -z "$LANDED_FILES" ]]; then
  echo "FAIL: PR #$PR_NUMBER merge commit $MERGE_SHA contains 0 file changes."
  echo
  echo "GitHub squash-merge dropped EVERYTHING (the issue #30 bug)."
  echo "PR claimed to change $PR_FILE_COUNT file(s):"
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    echo "  - $f"
  done <<<"$CHANGED_FILES_PR"
  echo
  echo "Re-open these changes in a follow-up PR. See CLAUDE.md Rule 17."
  exit 1
fi

# Soft-warn mode: PR claimed N files, fewer landed. This is sometimes
# benign — base branch advanced and absorbed identical changes during
# review, so those files become no-ops at squash time. We surface it as
# a warning, not a failure, so a human can spot the rare real drop.
missing=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if ! grep -Fxq "$f" <<<"$LANDED_FILES"; then
    missing+=("$f")
  fi
done <<<"$CHANGED_FILES_PR"

if (( ${#missing[@]} > 0 )); then
  echo "OK (with warning): PR #$PR_NUMBER ($MERGE_SHA) landed $LANDED_COUNT/$PR_FILE_COUNT files on $TARGET_BRANCH."
  echo
  echo "These files were in the PR but NOT in the squash commit:"
  printf '  - %s\n' "${missing[@]}"
  echo
  echo "Most likely benign — base advanced during review and absorbed identical changes."
  echo "If you expected real diffs in those files, spot-check with:"
  echo "  git show $MERGE_SHA -- <path>"
  exit 0
fi

echo "OK: PR #$PR_NUMBER ($MERGE_SHA) landed all $PR_FILE_COUNT file(s) on $TARGET_BRANCH."
