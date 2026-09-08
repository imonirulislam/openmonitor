#!/usr/bin/env bash
# Set the production env vars each Vercel project needs.
#
# GitHub secrets only reach the workflow. `vercel build` reads what `vercel
# pull` downloaded from the project, and deployed functions read the project's
# env at runtime — neither can see GitHub. So these have to live in Vercel, and
# a value being in GitHub secrets does nothing for a build.
#
#   ./deploy/vercel-env.sh            # print what would be set
#   ./deploy/vercel-env.sh --apply    # set it
#
# Reads deploy/secrets.env. DATABASE_URL and CLICKHOUSE_URL aren't generated —
# append them there or export them first. Re-running overwrites each key.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f deploy/secrets.env ] || {
  echo "deploy/secrets.env missing — run ./deploy/gen-secrets.sh" >&2
  exit 1
}
# shellcheck disable=SC1091
set -a && . ./deploy/secrets.env && set +a

ROOT_DOMAIN="${ROOT_DOMAIN:-openmonitor.app}"
: "${DATABASE_URL:?export DATABASE_URL (Neon pooled URL, the one with -pooler)}"
: "${CLICKHOUSE_URL:?export CLICKHOUSE_URL (https://clickhouse.$ROOT_DOMAIN)}"
: "${ADMIN_EMAIL:?export ADMIN_EMAIL — becomes OPERATOR_EMAILS on web}"

# No trailing slashes: apps/web/src/app/dashboard/settings/system/page.tsx
# concatenates ${API_URL}${path} raw.
APP_URL="https://app.$ROOT_DOMAIN"
API="https://api.$ROOT_DOMAIN"
STATUS_URL="https://status.$ROOT_DOMAIN"

keys_for() {
  case "$1" in
    web) echo "DATABASE_URL AUTH_SECRET AUTH_URL NEXT_PUBLIC_APP_URL API_URL
               NEXT_PUBLIC_API_URL NEXT_PUBLIC_STATUS_PAGE_URL PROBE_API_KEY
               OPERATOR_EMAILS CLICKHOUSE_URL CLICKHOUSE_USER CLICKHOUSE_PASSWORD" ;;
    api) echo "DATABASE_URL PROBE_API_KEY PAGE_UNLOCK_SECRET CRON_SECRET
               STATUS_PAGE_ROOT_DOMAIN RETENTION_ENABLED
               CLICKHOUSE_URL CLICKHOUSE_USER CLICKHOUSE_PASSWORD" ;;
    status-page) echo "API_URL NEXT_PUBLIC_API_URL" ;;
    marketing) echo "NEXT_PUBLIC_APP_URL NEXT_PUBLIC_STATUS_PAGE_URL" ;;
  esac
}

value_for() {
  case "$1" in
    DATABASE_URL)                 printf '%s' "$DATABASE_URL" ;;
    AUTH_SECRET)                  printf '%s' "$AUTH_SECRET" ;;
    PROBE_API_KEY)                printf '%s' "$PROBE_API_KEY" ;;
    PAGE_UNLOCK_SECRET)           printf '%s' "$PAGE_UNLOCK_SECRET" ;;
    CRON_SECRET)                  printf '%s' "$CRON_SECRET" ;;
    CLICKHOUSE_URL)               printf '%s' "$CLICKHOUSE_URL" ;;
    CLICKHOUSE_USER)              printf '%s' "$CLICKHOUSE_USER" ;;
    CLICKHOUSE_PASSWORD)          printf '%s' "$CLICKHOUSE_PASSWORD" ;;
    OPERATOR_EMAILS)              printf '%s' "$ADMIN_EMAIL" ;;
    AUTH_URL|NEXT_PUBLIC_APP_URL) printf '%s' "$APP_URL" ;;
    API_URL|NEXT_PUBLIC_API_URL)  printf '%s' "$API" ;;
    NEXT_PUBLIC_STATUS_PAGE_URL)  printf '%s' "$STATUS_URL" ;;
    STATUS_PAGE_ROOT_DOMAIN)      printf '%s' "$ROOT_DOMAIN" ;;
    # A frozen function can't run a timer, so the in-process scheduler would
    # look configured and never fire. Vercel Cron drives retention instead.
    RETENTION_ENABLED)            printf 'off' ;;
  esac
}

VERCEL=(bunx vercel@latest)
command -v vercel >/dev/null 2>&1 && VERCEL=(vercel)

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

for app in web api status-page marketing; do
  [ -f "apps/$app/.vercel/project.json" ] || {
    echo "apps/$app is not linked — run: (cd apps/$app && vercel link)" >&2
    exit 1
  }
  echo "── $app"
  for key in $(keys_for "$app"); do
    val="$(value_for "$key")"
    [ -n "$val" ] || { echo "  $key has no value — check deploy/secrets.env" >&2; exit 1; }
    case "$key" in
      # Secrets: confirm they're populated without printing them.
      *SECRET*|*PASSWORD*|*API_KEY*|DATABASE_URL) shown="[${#val} chars]" ;;
      *) shown="$val" ;;
    esac
    if [ "$APPLY" = 1 ]; then
      "${VERCEL[@]}" env rm "$key" production --yes --cwd "apps/$app" >/dev/null 2>&1 || true
      printf '%s' "$val" | "${VERCEL[@]}" env add "$key" production --cwd "apps/$app" >/dev/null
      echo "  set  $key = $shown"
    else
      echo "  would set  $key = $shown"
    fi
  done
done

[ "$APPLY" = 1 ] || { echo; echo "Dry run. Re-run with --apply."; exit 0; }

cat <<EOF

Set. Redeploy to pick them up:
  gh workflow run Deploy

Not handled here:
  SLACK_SIGNING_SECRET   only if you wire up the Slack inbound webhook
  NEXT_PUBLIC_DEFAULT_*  status-page single-tenant fallback; wildcard subdomains
                         make it unnecessary
EOF
