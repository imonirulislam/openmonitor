# packages/regions — Region display metadata

Turns a `probe_locations.region` code into something readable: city, flag, continent, provider.

## Why a static catalogue

The useful part — "iad is Ashburn" — is public knowledge, not per-deployment data. Storing it
in columns would mean asking an operator to type a continent for every location.

Codes here are user-chosen, so it can't be exhaustive. `getRegionInfo(code, { label })` falls
back to the caller's label under a **Private** continent, which is why this needed no
migration: `hetzner-fsn1` shows the operator's own name rather than a wrong guess.

## Conventions

- Client-safe, zero dependencies. Not in `@openmonitor/db` — that's server-only and the region
  picker is a client component.
- `groupRegions(items)` returns continents in `CONTINENTS` order with Private last.
- Adding a code: one entry in `CATALOGUE`. Lowercase key, matching the stored string exactly.

If operators start needing continents for codes we don't know, add `continent`/`provider`
columns to `probe_locations` and prefer them over the catalogue — don't grow this file with
one-off entries.
