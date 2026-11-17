#!/bin/sh
#
# NEO / Digital Ambush pre-commit gate.
# Installed by NEO 2026-11-17. Local only — no GitHub Actions, no CI cost.
#
# Blocks the commit (exit 1) when ANY of these fail:
#   1. A staged preview page does not exit 0 from scripts/gate2.js
#      (run WITH --registry so cross-prospect dedupe is enforced).
#   2. scripts/global-registry.json reports a duplicate origin photo or
#      duplicate asset bytes between two prospects.
#   3. A staged file falls outside the permitted scope:
#        <slug>/assets/**, <slug>/asset-sources.json, prospects/index.json,
#        scripts/**, or .agent/** (rules/docs).
#      This is the anti-freestyle rule: no repo-wide cosmetic sweeps.
#
# ImageMagick is required. If it is missing the hook fails closed rather than
# letting an unmeasurable page through.
#
# Bypass (founder only, never for AG):  git commit --no-verify

set -u

REPO_ROOT=$(git rev-parse --show-toplevel) || exit 1
cd "$REPO_ROOT" || exit 1

RED=''
YEL=''
OFF=''
# Only colourise on a TTY so logs stay clean when piped.
if [ -t 1 ]; then
  RED=$(printf '\033[31m'); YEL=$(printf '\033[33m'); OFF=$(printf '\033[0m')
fi

fail=0
header() { printf '%s\n' "------------------------------------------------------------"; }

echo "Digital Ambush pre-commit gate"

# ---------------------------------------------------------------------------
# 0. Tooling preflight — fail closed.
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "${RED}BLOCKED${OFF} node not found on PATH."
  exit 1
fi
if [ ! -f scripts/imagick.js ]; then
  echo "${RED}BLOCKED${OFF} scripts/imagick.js missing — cannot verify image checks."
  exit 1
fi
IM_PROBE=$(node -e "try{require('./scripts/imagick').assertImageTooling();process.stdout.write('ok')}catch(e){process.stdout.write('bad:'+e.message.split('\n')[0])}" 2>&1)
case "$IM_PROBE" in
  ok) : ;;
  *)
    echo "${RED}BLOCKED${OFF} ImageMagick unusable: $IM_PROBE"
    echo "         Fix: winget install --id ImageMagick.ImageMagick   (Windows)"
    echo "              sudo apt-get install -y imagemagick          (Linux)"
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# 1. Scope check — block out-of-scope (freestyle) changes.
# ---------------------------------------------------------------------------
STAGED=$(git diff --cached --name-only --diff-filter=ACMR)
if [ -z "$STAGED" ]; then
  echo "Nothing staged; nothing to check."
  exit 0
fi

SCOPE_BAD=''
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    */assets/*|*/asset-sources.json|prospects/index.json|scripts/*|.agent/*|GEMINI.md|README.md)
      : ;;
    # Root-level infrastructure that is legitimately edited but not a preview:
    .gitignore|package.json|package-lock.json)
      : ;;
    *)
      SCOPE_BAD="$SCOPE_BAD$f
"
      ;;
  esac
done <<EOF
$STAGED
EOF

if [ -n "$SCOPE_BAD" ]; then
  echo "${RED}BLOCKED${OFF} staged files outside the permitted scope:"
  printf '%s' "$SCOPE_BAD" | sed 's/^/         /'
  echo "         Allowed: <slug>/assets/**, <slug>/asset-sources.json,"
  echo "                  prospects/index.json, scripts/**, .agent/**"
  echo "         This is the anti-freestyle rule (no repo-wide sweeps)."
  fail=1
fi

# ---------------------------------------------------------------------------
# 2. Collect staged preview pages and gate each one.
# ---------------------------------------------------------------------------
SLUGS=''
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    */index.html)
      slug=$(dirname "$f")
      case "$slug" in .|*/* ) continue ;; esac
      SLUGS="$SLUGS$slug
"
      ;;
  esac
done <<EOF
$STAGED
EOF

if [ -n "$SLUGS" ]; then
  # Refresh the canonical registry so dedupe reflects the staged state.
  node scripts/registry.js >/tmp/digital-ambush-registry.log 2>&1
  REG_RC=$?
  if [ $REG_RC -ne 0 ]; then
    echo "${RED}BLOCKED${OFF} scripts/registry.js found a problem:"
    sed 's/^/         /' /tmp/digital-ambush-registry.log
    fail=1
  else
    echo "Registry: $(grep -c '^PASS' /tmp/digital-ambush-registry.log 2>/dev/null || echo 0) checks clean"
  fi

  while IFS= read -r slug; do
    [ -z "$slug" ] && continue
    page="$slug/index.html"
    [ -f "$page" ] || continue
    echo "Gating $slug ..."
    node scripts/gate2.js "$page" --registry scripts/global-registry.json >/tmp/digital-ambush-gate.log 2>&1
    RC=$?
    if [ $RC -ne 0 ]; then
      echo "${RED}BLOCKED${OFF} $slug failed gate2.js (exit $RC):"
      grep -E '^(FAIL|GATE)' /tmp/digital-ambush-gate.log | sed 's/^/         /'
      fail=1
    else
      echo "         PASS ${slug}"
    fi
  done <<EOF
$SLUGS
EOF
else
  echo "No staged preview pages (docs/scripts only)."
fi

header
if [ $fail -ne 0 ]; then
  echo "${RED}COMMIT BLOCKED${OFF} — fix the items above."
  echo "Nothing was committed. Do NOT use a VR- receipt for a failing page."
  exit 1
fi

echo "ALL CHECKS PASSED — commit allowed."
exit 0
