# deploy/fly — remote probe locations

One Fly app per probe location. The checker dials out and serves nothing, so each app is a
single always-on 256mb machine with no public address.

`checker.fly.toml` is the template; `checker-fra.toml` is Frankfurt, the first EU location.

## Why Fly and not Railway

- Railway has **one** European region (Amsterdam, `europe-west4-drams3a`). Fly has eight
  already in `@openmonitor/regions`: `ams` `arn` `cdg` `fra` `lhr` `mad` `otp` `waw`.
  Geographic diversity is the reason to add EU at all, and it isn't purchasable on Railway
  at any price.
- The catalogue is keyed on Fly IATA codes with `provider: "fly"`. A Railway region has no
  entry, so it renders as "Private" with no city, flag or continent.
- Cost, checked 2026-09-14 — verify before relying on it:

  | | Fly | Railway |
  |---|---|---|
  | 256mb always-on | $2.02/mo (ams) | ~$2.50/mo RAM + ~$0.40 CPU |
  | Plan floor | none, usage only | $5/mo Hobby (includes $5 credit) |
  | **Effective** | **~$2/mo** | **$5/mo** |
  | Each extra region | +~$2 | not available in EU |

  Egress is $0.02/GB in Europe and probe traffic is negligible.

## Adding a location

Order matters. The region shown on results comes from the **probe location row**, not from
`primary_region` — that only says where the machine runs. Set them to the same code or
Frankfurt machines will report as somewhere else.

1. Dashboard → Settings → Probe locations → create one with region code `fra`. The token is
   shown once; only its SHA-256 hash is stored.
2. Copy the template and edit `app` + `primary_region` to match that code:
   ```
   cp deploy/fly/checker.fly.toml deploy/fly/checker-cdg.toml
   ```
3. Check `API_URL` points at the live API — the template assumes
   `https://api.openmonitor.app`.
4. From the repo root:
   ```
   fly launch --no-deploy --copy-config --config deploy/fly/checker-fra.toml
   fly secrets set PROBE_TOKEN=omp_… --config deploy/fly/checker-fra.toml
   fly deploy --config deploy/fly/checker-fra.toml
   ```

## Deploys

`.github/workflows/deploy.yml` deploys every location on a push to `main` that touches
`apps/checker/`, `deploy/docker/checker.Dockerfile`, or a config here. It fans out over
`deploy/fly/checker-*.toml`, so a new region ships as soon as its file lands — nothing to
register. `checker.fly.toml` is the template and is never deployed.

Needs one repo secret in the `production` environment:

```
gh secret set FLY_API_TOKEN --env production --body "$(fly tokens create deploy -x 8760h)"
```

An org-wide deploy token covers every location. The job only ever runs `flyctl deploy` —
creating the app and setting `PROBE_TOKEN` stay manual, so CI can't invent a location that
has no matching row in the dashboard.

Regions deploy independently (`fail-fast: false`): one failing leaves the rest up. CI's
`go build` + `go vet` gate the deploy, and it waits on `api` so the checker never ships
against an API that hasn't.

## Checking it works

```
fly logs --config deploy/fly/checker-fra.toml
```

Then Settings → Probe locations, or `GET /v1/system/checker`, for freshness per region. A
location that stops reporting is silent by design — nothing pages you about it.

## Notes

- A lost `PROBE_TOKEN` is rotated, not recovered.
- Never set `DATABASE_URL` here. Remote regions reach data only through the API.
- Don't scale one app across regions: every result would report under one location.
