# The VM

ClickHouse, notifier, checker, Caddy and ch-ui on one box. Postgres is Neon; the web apps are
on Vercel.

Written for Ubuntu 24.04. Do the hardening before the deploy — the compose stack opens 80 and
443 to the world.

## 1. A user that isn't root

```bash
adduser om && usermod -aG sudo om
mkdir -p /home/om/.ssh && cp ~/.ssh/authorized_keys /home/om/.ssh/
chown -R om:om /home/om/.ssh && chmod 700 /home/om/.ssh && chmod 600 /home/om/.ssh/authorized_keys
```

## 2. SSH

**Open a second terminal and confirm `ssh om@host` works before touching sshd.** Getting this
wrong on a fresh VPS means a rescue console.

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sudo systemctl restart ssh
```

## 3. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp     # Caddy: certificate issuance and ClickHouse over TLS
sudo ufw enable
```

Nothing else needs opening. ClickHouse isn't published directly, and ch-ui binds to
loopback unless you give it a vhost.

## 4. Unattended upgrades and fail2ban

```bash
sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 5. Rootless Docker

Use Docker's own repository, not Ubuntu's `docker.io` — the rootless setup tool ships in
`docker-ce-rootless-extras`, which `docker.io` doesn't include.

If a rootful Docker is already installed, remove it first:

```bash
sudo systemctl disable --now docker.service docker.socket containerd 2>/dev/null || true
sudo apt purge -y docker.io docker-ce docker-ce-cli docker-ce-rootless-extras \
  containerd containerd.io docker-buildx-plugin docker-compose-plugin runc
sudo apt autoremove -y && sudo rm -rf /var/lib/docker /var/lib/containerd /etc/docker
```

```bash
sudo apt update && sudo apt install -y ca-certificates curl uidmap dbus-user-session
sudo install -m0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin docker-ce-rootless-extras
sudo systemctl disable --now docker.service docker.socket   # rootful daemon stays off
```

Then as the unprivileged user, never with sudo:

```bash
sudo loginctl enable-linger om            # keep the user session alive after logout
dockerd-rootless-setuptool.sh install
echo "export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock" >> ~/.bashrc
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
```

`permission denied ... /var/run/docker.sock` means `DOCKER_HOST` isn't set and the client is
reaching for the rootful socket.

Three things this stack needs on top:

```bash
# Caddy binds 80 and 443. Rootless can't touch ports below 1024 by default.
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/99-rootless-ports.conf
sudo sysctl --system

# ClickHouse asks for 262144 open files; a rootless container inherits the
# user's limit, which is ~1024.
sudo tee /etc/security/limits.d/99-om.conf <<'EOF'
om soft nofile 1048576
om hard nofile 1048576
EOF
```

`mem_limit` needs cgroup v2 delegation. Verify rather than assume — without it the limits are
ignored silently rather than failing:

```bash
docker info | grep -iE 'rootless|cgroup version'   # expect rootless, Cgroup Version: 2
docker info 2>&1 | grep -i 'limit'                 # any "No memory limit support" is a problem
```

Log out and back in for the group, linger and limits changes to apply.

## 6. Deploy

```bash
git clone https://github.com/imonirulislam/openmonitor && cd openmonitor
cp deploy/vm/.env.example deploy/vm/.env && $EDITOR deploy/vm/.env
docker compose -f deploy/vm/docker-compose.yml --env-file deploy/vm/.env up -d --build
```

Point an A record at the box for `CLICKHOUSE_HOSTNAME` **before** starting, or Caddy's first
certificate attempt fails and it backs off.

Behind Cloudflare the proxy can stay on: Cloudflare forwards `/.well-known/acme-challenge/`
to origin :80, so HTTP-01 completes. Caddy tries TLS-ALPN-01 first and that one *does* fail
behind a proxy (`Cannot negotiate ALPN protocol "acme-tls/1"`) — harmless, it falls back.

Grey-cloud the record only if issuance keeps failing; check the log before assuming DNS is at
fault.

### First admin

The database is empty and there is no signup page, so create the first account before you try
to log in. From anywhere that can reach Neon:

```bash
DATABASE_URL="postgresql://…-pooler…?sslmode=require" \
  ADMIN_EMAIL=you@example.com bun run --filter @openmonitor/auth bootstrap
```

It prints a generated password once. Then set `OPERATOR_EMAILS` on the `web` project to that
address, or you won't be able to manage shared probe locations.

Then set on the `web` and `api` Vercel projects:

```
CLICKHOUSE_URL=https://<CLICKHOUSE_HOSTNAME>
CLICKHOUSE_USER=…
CLICKHOUSE_PASSWORD=…
```

## 7. Check it

```bash
docker compose -f deploy/vm/docker-compose.yml ps
curl -u "$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD" https://<hostname>/ping     # Ok.
curl -o /dev/null -w '%{http_code}\n' https://<hostname>/ping               # 403 without auth
docker compose -f deploy/vm/docker-compose.yml logs checker | tail
```

`Settings → Probe locations` should show **Last seen** ticking within one check interval.
`401 unauthorized` in the checker log means the probe token doesn't match a location.

### ch-ui

By default it binds to loopback only — reach it over a tunnel:

```bash
ssh -L 5436:127.0.0.1:5436 om@host   # then http://localhost:5436
```

Sign in with the ClickHouse credentials.

To put it on a hostname instead, point an A record at this box and drop in a vhost:

```bash
cp deploy/vm/conf.d/chui.caddy.example deploy/vm/conf.d/chui.caddy
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'a long password'
$EDITOR deploy/vm/conf.d/chui.caddy    # set the hostname and paste the hash
docker compose -f deploy/vm/docker-compose.yml --env-file deploy/vm/.env up -d caddy
```

`up -d`, not `restart`: the conf.d mount was added to the compose file, and `restart` reuses
the container's existing mounts. Miss that and the import silently matches nothing — a glob
with no files is not an error, so Caddy starts cleanly managing only ClickHouse.

Confirm the hostname is actually managed before looking anywhere else:

```bash
docker compose -f deploy/vm/docker-compose.yml logs caddy | grep 'automatic TLS' | tail -1
```

That line lists every domain Caddy will get a certificate for. If the new hostname isn't in
it, no amount of DNS work will help — Caddy hasn't loaded the vhost. Cloudflare reports that
as **525**, which looks like a TLS problem and isn't.

**Don't skip the basic auth.** ch-ui's own sign-in is a ClickHouse connection test, not an
account check: it accepts any credentials and tells you whether ClickHouse liked them. Public
and unauthenticated, that's a credential oracle against the datastore. Caddy authenticates
first so ch-ui never sees an unauthenticated request.

Vhosts live in `conf.d/` rather than the Caddyfile because Caddy also fronts ClickHouse — a bad
directive would fail the whole config and take the datastore's TLS with it. `conf.d/*.caddy` is
gitignored; the `.example` is checked in.

## Rootless and probe timings

Rootless outbound traffic goes through pasta/slirp4netns rather than the host stack, which
adds a small fixed overhead to every connection. Availability results are unaffected;
*absolute* latency reads slightly high. It's consistent, so trends and comparisons stay
meaningful — but don't compare these numbers against a probe running rootful elsewhere.

If probe latency matters more than isolation, run the checker on a separate rootful host and
keep the datastore here.
