#!/usr/bin/env bash
# Filename: verify-deb.sh
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
#
# Static checks of the built .deb: metadata, contents, permissions, maintainer scripts, size limits
# (NFR-16) and lintian. Usage: scripts/verify-deb.sh [path/to/package.deb]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEB="${1:-$(ls "$ROOT"/dist/mind-study_*_amd64.deb | head -n 1)}"
MAX_DEB_MB=500
MAX_INSTALLED_MB=1024
failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}
ok() { echo "ok:   $*"; }

[[ -f "$DEB" ]] || { echo "No .deb found at $DEB" >&2; exit 2; }
echo "Verifying $DEB"

field() { dpkg-deb -f "$DEB" "$1"; }
contents="$(dpkg-deb -c "$DEB")"
version="$(node -p "require('$ROOT/package.json').version")"

# --- Metadata -----------------------------------------------------------------------------
[[ "$(field Package)" == "mind-study" ]] && ok "package name" || fail "package name is $(field Package)"
[[ "$(field Architecture)" == "amd64" ]] && ok "architecture amd64" || fail "architecture is $(field Architecture)"
[[ "$(field Version)" == "$version" ]] && ok "version $version" || fail "version $(field Version) != $version"
[[ -n "$(field Maintainer)" ]] && ok "maintainer set" || fail "missing maintainer"
field Depends | grep -q "libgtk-3-0" && ok "depends on GTK 3" || fail "Depends lacks libgtk-3-0"
field Depends | grep -q "libnss3" && ok "depends on NSS" || fail "Depends lacks libnss3"
[[ "$(field Section)" == "education" ]] && ok "section education" || fail "section is $(field Section)"

# --- Contents -----------------------------------------------------------------------------
require() {
  if grep -q -- "$1" <<<"$contents"; then ok "contains $1"; else fail "missing $1"; fi
}
require "./opt/MIND/mind$"
require "./opt/MIND/chrome-sandbox$"
require "./opt/MIND/resources/app.asar$"
require "./opt/MIND/resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds/linux-x64.node$"
require "./usr/share/applications/mind.desktop$"
require "./usr/share/doc/mind-study/copyright$"
for size in 16 32 48 64 128 256 512; do
  require "./usr/share/icons/hicolor/${size}x${size}/apps/mind.png$"
done

forbid() {
  if grep -qE -- "$1" <<<"$contents"; then fail "unexpected content: $1"; else ok "no $2"; fi
}
# Nothing under a home directory or a config directory: user data must survive removal (NFR-17).
forbid '^[^ ]+ +[^ ]+ +[0-9]+ [^ ]+ [^ ]+ \./(home|root|etc/skel)/' "files in home directories"
forbid '\.config/mind' "files under .config/mind"
forbid 'better-sqlite3/prebuilds/(win32|darwin|linuxmusl)' "other platforms' native binaries"

# --- Sandbox helper and maintainer scripts -------------------------------------------------
control_dir="$(mktemp -d)"
trap 'rm -rf "$control_dir"' EXIT
dpkg-deb -e "$DEB" "$control_dir"
grep -q "chrome-sandbox" "$control_dir/postinst" && ok "postinst configures chrome-sandbox" || fail "postinst ignores chrome-sandbox"
if grep -Eq '(\$HOME|~/|/home/|\.config)' "$control_dir/postinst" "$control_dir/postrm"; then
  fail "maintainer scripts touch user directories"
else
  ok "maintainer scripts do not touch user directories"
fi
[[ ! -e "$control_dir/conffiles" ]] && ok "no conffiles" || fail "unexpected conffiles"

# --- Desktop entry -------------------------------------------------------------------------
desktop="$(mktemp -d)"
dpkg-deb -x "$DEB" "$desktop"
if command -v desktop-file-validate >/dev/null; then
  desktop-file-validate "$desktop/usr/share/applications/mind.desktop" && ok "desktop entry validates" || fail "desktop entry invalid"
fi
grep -q "^Categories=Education;" "$desktop/usr/share/applications/mind.desktop" && ok "desktop category" || fail "desktop category"
rm -rf "$desktop"

# --- Size limits (NFR-16) ------------------------------------------------------------------
deb_mb=$(( $(stat -c %s "$DEB") / 1024 / 1024 ))
installed_mb=$(( $(field Installed-Size) / 1024 ))
echo "size: .deb ${deb_mb} MB (limit ${MAX_DEB_MB}), installed ${installed_mb} MB (limit ${MAX_INSTALLED_MB})"
(( deb_mb <= MAX_DEB_MB )) && ok ".deb within limit" || fail ".deb too large"
(( installed_mb <= MAX_INSTALLED_MB )) && ok "installed size within limit" || fail "installed size too large"

# --- Lintian -------------------------------------------------------------------------------
# Electron apps bundle Chromium and install under /opt, which trips a few expected tags.
if command -v lintian >/dev/null; then
  if lintian --fail-on error \
    --suppress-tags dir-or-file-in-opt,embedded-library,shared-library-is-executable,unstripped-binary-or-object,missing-dependency-on-libc \
    "$DEB"; then
    ok "lintian reports no errors"
  else
    fail "lintian reported errors"
  fi
else
  echo "skip: lintian is not installed"
fi

if (( failures > 0 )); then
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "All checks passed."
