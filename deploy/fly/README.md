# deploy/fly — remote probe locations

One Fly app per probe location. The checker dials out and serves nothing, so each app is a
single always-on 256mb machine with no public address.

`checker.fly.toml` is the template; `checker-iad.toml` (Ashburn) is the live location. Keep
new ones in the shape `fly launch` generates rather than hand-writing them.

## Region policy

`majority` is `down * 2 > total`, so it only becomes a real vote at three or more
locations. At two it needs both regions down, which is identical to `all`, and at one every
policy agrees. Below three, the choice is between `any` (a single blip alerts) and
"both must fail" (a single-region outage doesn't).

Regions that have gone quiet for more than 3x a monitor's interval stop counting, so
retiring a location degrades the vote on its own — check the policy still fits afterwards.

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
Ashburn machines will report as somewhere else.

Adding Amsterdam, as a worked example:

1. Dashboard → Settings → Probe locations → create one with region code `ams`. The token is
   shown once; only its SHA-256 hash is stored.
2. Copy the template and edit `app` + `primary_region` to match that code:
   ```
   cp deploy/fly/checker.fly.toml deploy/fly/checker-ams.toml
   ```
3. Check `API_URL` points at the live API — the template assumes
   `https://api.openmonitor.app`.
4. From the repo root:
   ```
   fly launch --no-deploy --copy-config --org open-monitor --config deploy/fly/checker-ams.toml
   fly secrets set PROBE_TOKEN=omp_… --config deploy/fly/checker-ams.toml
   fly deploy --config deploy/fly/checker-ams.toml
   ```

   `--org open-monitor` matters: apps default to the personal org, and the org token CI
   holds won't deploy them.

Pushing that file to `main` is what deploys it from then on.

## Deploys

`.github/workflows/deploy.yml` deploys every location on a push to `main` that touches
`apps/checker/`, `deploy/docker/checker.Dockerfile`, or a config here. It fans out over
`deploy/fly/checker-*.toml`, so a new region ships as soon as its file lands — nothing to
register. `checker.fly.toml` is the template and is never deployed.

Needs one repo secret in the `production` environment. `tokens create deploy` is scoped to a
single app, so use `tokens create org` — one token covers every location, including ones
added later:

```
fly tokens create org -o open-monitor -x 8760h -n "github-actions checker" \
  | gh secret set FLY_API_TOKEN --env production
```

Piped so the token never lands in shell history. There are two orgs on this account —
`personal` and `open-monitor` — so `-o` is not optional; without it flyctl prompts, and a
token minted against `personal` fails on every app here.

The job only ever runs `flyctl deploy` — creating the app and setting `PROBE_TOKEN` stay
manual, so CI can't invent a location that has no matching row in the dashboard.

Regions deploy independently (`fail-fast: false`): one failing leaves the rest up. CI's
`go build` + `go vet` gate the deploy, and it waits on `api` so the checker never ships
against an API that hasn't.

## Checking it works

```
fly logs --config deploy/fly/checker-iad.toml
```

Then Settings → Probe locations, or `GET /v1/system/checker`, for freshness per region. A
location that stops reporting is silent by design — nothing pages you about it.

## Notes

- A lost `PROBE_TOKEN` is rotated, not recovered.
- Never set `DATABASE_URL` here. Remote regions reach data only through the API.
- Don't scale one app across regions: every result would report under one location.
