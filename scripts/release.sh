#!/usr/bin/env bash
set -euo pipefail

# Publish an already-versioned, merged @desirecore/super-doc commit.
# This script never pulls, changes versions, commits, or pushes protected branches.
# Usage: ./scripts/release.sh <version> [otp]

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/cherry-markdown"
PKG_JSON="$PKG_DIR/package.json"
VERSION="${1:-}"
OTP="${2:-}"
RELEASE_REF="${SUPER_DOC_RELEASE_REF:-origin/dev}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> [otp]"
  exit 1
fi

cd "$ROOT_DIR"

assert_clean_repository() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Release aborted: tracked worktree or index changes are present."
    exit 1
  fi
  if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    echo "Release aborted: untracked files are present."
    exit 1
  fi
}

assert_clean_repository

if ! git rev-parse --verify --quiet "$RELEASE_REF" >/dev/null; then
  echo "Release aborted: $RELEASE_REF is unavailable. Fetch it outside this script and retry."
  exit 1
fi

if ! git merge-base --is-ancestor HEAD "$RELEASE_REF"; then
  echo "Release aborted: HEAD is not contained in $RELEASE_REF; publish only an already merged commit."
  exit 1
fi

PACKAGE_VERSION="$(node -p "require('$PKG_JSON').version")"
PACKAGE_NAME="$(node -p "require('$PKG_JSON').name")"
if [ "$PACKAGE_VERSION" != "$VERSION" ]; then
  echo "Release aborted: requested $VERSION but the merged package version is $PACKAGE_VERSION."
  exit 1
fi
if [ "$PACKAGE_NAME" != "@desirecore/super-doc" ]; then
  echo "Release aborted: unexpected package name $PACKAGE_NAME."
  exit 1
fi

ARTIFACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/super-doc-release-${VERSION}.XXXXXX")"
PACK_JSON="$ARTIFACT_DIR/npm-pack.json"
VERIFICATION_JSON="$ARTIFACT_DIR/verification.json"

echo "==> Building the merged @desirecore/super-doc@$VERSION commit..."
yarn workspace @desirecore/super-doc build

echo "==> Re-verifying serialized dist artifacts..."
yarn workspace @desirecore/super-doc verify:dist

echo "==> Packing the exact publish candidate outside the repository..."
(cd "$PKG_DIR" && npm pack --json --ignore-scripts --pack-destination "$ARTIFACT_DIR") >"$PACK_JSON"
TARBALL_FILENAME="$(node -e 'const p=require(process.argv[1]); if (!p[0]?.filename) process.exit(1); process.stdout.write(p[0].filename)' "$PACK_JSON")"
TARBALL="$ARTIFACT_DIR/$TARBALL_FILENAME"

echo "==> Verifying tarball version, entries, CSS, types, capabilities, and integrity..."
node "$PKG_DIR/build/verify-pack.js" "$PACK_JSON" "$VERSION" "$PKG_DIR" | tee "$VERIFICATION_JSON"

# The build may create ignored dist files, but it must never rewrite tracked or add untracked repository content.
assert_clean_repository

if [ -n "$OTP" ]; then
  echo "==> Publishing the verified tarball..."
  npm publish "$TARBALL" --access public --otp "$OTP"
  echo "==> Published @desirecore/super-doc@$VERSION"
else
  echo "No OTP provided; repository state was not changed and nothing was published."
  echo "Verified publish candidate: $TARBALL"
  echo "Verification manifest: $VERIFICATION_JSON"
  echo "Publish these exact bytes with: npm publish \"$TARBALL\" --access public --otp <your-otp>"
fi
