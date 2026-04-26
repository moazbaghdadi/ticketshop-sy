# TicketShop — self-hosted deploy (Proxmox + Cloudflare Tunnel)

End-to-end runbook for deploying the full stack (Postgres + NestJS backend + customer + admin Angular apps) on a single Linux host, exposed via a Cloudflare Tunnel.

Designed for a Proxmox LXC or VM running Debian 12 / Ubuntu 24.04. Same Compose stack runs unchanged on Hetzner / any Docker host if migration is ever needed.

## Hostnames

Single-level subdomains so Cloudflare's free Universal SSL covers them — `*.ce-svcs.cc` is included on the free plan, but deeper patterns like `*.foo.ce-svcs.cc` would require Advanced Certificate Manager (~$10/mo).

| Hostname | Container | Host port | Purpose |
| --- | --- | --- | --- |
| `tickets-api.ce-svcs.cc` | `backend` | `13000` | NestJS API (`/api/v1`) |
| `tickets.ce-svcs.cc` | `customer` | `8080` | Customer booking app |
| `tickets-admin.ce-svcs.cc` | `admin` | `8081` | Travel-companies dashboard |

## One-time host setup

```bash
# 1. As root: install Docker + git
apt update && apt install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 2. Clone the repo into /opt/ticketshop (deploy/ holds compose + tunnel config)
git clone https://github.com/<your-user>/ticketshop-sy.git /opt/ticketshop
cd /opt/ticketshop/deploy

# 3. Create the env file
cp .env.example .env
$EDITOR .env       # generate JWT_SECRET via:  openssl rand -base64 48
```

## Cloudflare Tunnel — reuse the existing tunnel LXC

The compose file does NOT run cloudflared; instead it publishes ports `13000`, `8080`, `8081` on this LXC's interface so the existing cloudflared LXC can reach them by IP.

1. **Find this LXC's IP:** `ip -4 addr show eth0 | awk '/inet/ {print $2}' | cut -d/ -f1`
2. **Add three Public Hostnames** to your existing tunnel:
   - **Dashboard-managed tunnel:** Zero Trust → Networks → Tunnels → your tunnel → "Public Hostname" tab. Add three rows pointing at `<lxc-ip>:13000` (api), `<lxc-ip>:8080` (customer), `<lxc-ip>:8081` (admin), all `HTTP` (the cloudflared → app hop is local; Cloudflare handles public TLS). DNS CNAMEs are auto-created.
   - **Locally-managed tunnel** (`config.yml` on disk): see `cloudflared/config.example.yml` in this directory for the snippet, then run `cloudflared tunnel route dns <tunnel> <hostname>` once per hostname to create the DNS records.

## Bring up the stack

```bash
cd /opt/ticketshop/deploy
docker compose build         # ~5–8 min on first run (3 images)
docker compose up -d
docker compose ps            # all services should be healthy/running
docker compose logs -f backend
```

The Cloudflare tunnel container will register with Cloudflare and start serving the three hostnames within ~30 seconds. Test:

```bash
curl -sS "https://tickets-api.ce-svcs.cc/api/v1/trips?fromCityId=damascus&toCityId=aleppo&date=$(date +%F)" | head -c 200
open https://tickets.ce-svcs.cc
open https://tickets-admin.ce-svcs.cc
```

## First-time bootstrap

Postgres starts empty. Two options:

- **Seed dev data** (drops/recreates everything):
  ```bash
  docker compose exec backend node -e "require('./backend/dist/seeder/seed.js')" \
    || docker compose run --rm backend npm run seed -w backend
  ```
- **Real bootstrap** (issue an invitation, then accept it in the admin UI):
  ```bash
  docker compose exec backend npm run invite -w backend -- \
    --email=you@example.com \
    --companyId=<company-uuid> \
    --role=admin
  ```

## Updating to the latest code

```bash
cd /opt/ticketshop
git pull
cd deploy
docker compose build
docker compose up -d
docker image prune -f          # reclaim space from old image layers
```

Roughly 1–2 minutes once layers are cached. Backend rolls in-place; Angular containers swap to the new build.

## Backups

`backup.sh` runs `pg_dump` into `deploy/backups/` and prunes anything older than 14 days. Wire it into root's crontab:

```bash
sudo crontab -e
# Add:
0 3 * * * /opt/ticketshop/deploy/backup.sh >> /var/log/ticketshop-backup.log 2>&1
```

To ship dumps off-box (recommended before pilot), install `rclone`, run `rclone config` to set up a Backblaze B2 / Cloudflare R2 / S3 remote, then uncomment the `rclone copy` line at the bottom of `backup.sh`.

Restore from a dump:
```bash
docker compose stop backend
docker exec -i ticketshop-postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < backups/2026-04-26.dump
docker compose start backend
```

## Common operations

```bash
# Tail logs
docker compose logs -f backend
docker compose logs -f cloudflared

# psql shell
docker compose exec postgres psql -U "$DB_USER" -d "$DB_NAME"

# Restart a single service after editing .env
docker compose up -d backend

# Stop everything (data persists in ./postgres-data)
docker compose down

# Nuke everything including the database (DESTRUCTIVE)
docker compose down -v && rm -rf postgres-data
```

## Notes / future hardening

- `synchronize: true` is still on in the backend (per repo CLAUDE.md). Fine for showcase + early pilot. Switch to explicit TypeORM migrations + `synchronize: false` before real customer data lands — the Railway 2026-04-26 incident is the cautionary tale.
- The Angular API URL is baked into each image at build time via the `API_URL` build arg (defaults to `https://tickets-api.ce-svcs.cc/api/v1`). Changing it requires a `docker compose build` of the customer/admin services.
- Migration to another host (e.g. Hetzner): copy `/opt/ticketshop/deploy/.env`, the latest `backups/*.dump`, and `cloudflared/*.json + config.yml` to the new box, run the same `docker compose up -d`, then `pg_restore` the dump. Tunnel keeps working — Cloudflare doesn't care which IP the connector lives on.
