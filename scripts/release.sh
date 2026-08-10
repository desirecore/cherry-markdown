#!/usr/bin/env bash
set -euo pipefail

# Release script for @desirecore/super-doc
# Usage: ./scripts/release.sh <version> [otp]
# Example: ./scripts/release.sh 0.2.11 123456

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/cherry-markdown"
PKG_JSON="$PKG_DIR/package.json"

# --- Args ---
VERSION="${1:-}"
OTP="${2:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> [otp]"
  echo "Example: $0 0.2.11 123456"
  exit 1
fi

echo "==> Pulling latest code..."
cd "$ROOT_DIR"
git pull origin dev

echo "==> Bumping version to $VERSION..."
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$PKG_JSON"

echo "==> Cleaning dist..."
cd "$PKG_DIR"
npx rimraf ./dist

echo "==> Building release artifacts..."
npx run-p iconfont build:styles build:types build:addons build:full build:core build:engine build:engine-full build:stream build:wysiwyg

echo "==> Verifying declared type entrypoint..."
test -f dist/types/index.d.ts

echo "==> Copying engine type declarations..."
cp dist/super-doc.engine.core.d.ts dist/super-doc.engine.d.ts
cp dist/super-doc.engine.core.esm.d.ts dist/super-doc.engine.esm.d.ts

echo "==> Committing and pushing..."
cd "$ROOT_DIR"
git add packages/cherry-markdown/package.json
git commit -m "chore: bump version to $VERSION"
git push origin dev

echo "==> Publishing to npm..."
if [ -n "$OTP" ]; then
  cd "$PKG_DIR" && npm publish --access public --otp "$OTP"
else
  echo "No OTP provided. Run the following command with your OTP:"
  echo "  cd $PKG_DIR && npm publish --access public --otp <your-otp>"
fi

echo "==> Done! @desirecore/super-doc@$VERSION"
