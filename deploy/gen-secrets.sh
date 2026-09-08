#!/usr/bin/env bash
# Generate the shared secrets once, write them to deploy/secrets.env (gitignored,
# chmod 600), and optionally push the GitHub Actions ones with `gh`.
#
#   ./deploy/gen-secrets.sh            # generate only
#   ./deploy/gen-secrets.sh --gh       # also set the GitHub secrets
#
# Several values are deliberately shared across places — the same CRON_SECRET
# has to be on the api and the notifier for one scheduler to drive both, and the
# same CLICKHOUSE_PASSWORD on the VM and every project that queries it. The
# table at the end says where each one goes.
#
# Re-running overwrites the file and rotates everything. Don't, unless you mean
# to: rotating CLICKHOUSE_PASSWORD without updating the VM breaks every query.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="deploy/secrets.env"

if [ -f "$OUT" ] && [ "${1:-}" != "--force" ]; then
  echo "$OUT already exists. Use --force to rotate everything." >&2
  exit 1
fi

gen() { openssl rand -base64 32 | tr -d '\n=+/' | cut -c1-40; }

umask 077
cat > "$OUT" <<EOF
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ). Never commit; deploy/secrets.env is gitignored.
AUTH_SECRET=$(gen)
PROBE_API_KEY=$(gen)
PAGE_UNLOCK_SECRET=$(gen)
CRON_SECRET=$(gen)
CLICKHOUSE_PASSWORD=$(gen)
CLICKHOUSE_USER=openmonitor
EOF
chmod 600 "$OUT"
echo "Wrote $OUT (chmod 600)"

if [ "${1:-}" = "--gh" ] || [ "${2:-}" = "--gh" ]; then
  # shellcheck disable=SC1090
  set -a && . "./$OUT" && set +a
  for n in CLICKHOUSE_USER CLICKHOUSE_PASSWORD; do
    gh secret set "$n" --body "${!n}" && echo "  gh secret: $n"
  done
  echo "VERCEL_*, DATABASE_URL and CLICKHOUSE_URL are yours to add — see below."
fi

cat <<'EOF'

Where each value goes
─────────────────────────────────────────────────────────────────────
AUTH_SECRET           web
PROBE_API_KEY         web, api
PAGE_UNLOCK_SECRET    api
CRON_SECRET           api        (notifier too, if you ever run it serverless)
CLICKHOUSE_USER       web, api, GitHub, deploy/vm/.env
CLICKHOUSE_PASSWORD   web, api, GitHub, deploy/vm/.env

Not generated here — you supply them
─────────────────────────────────────────────────────────────────────
DATABASE_URL          Neon, pooled endpoint (-pooler in the host)
CLICKHOUSE_URL        https://<your clickhouse hostname>
VERCEL_TOKEN          vercel.com/account/tokens
VERCEL_ORG_ID         apps/*/.vercel/project.json  (same for all)
VERCEL_PROJECT_ID_*   apps/<app>/.vercel/project.json
EOF
