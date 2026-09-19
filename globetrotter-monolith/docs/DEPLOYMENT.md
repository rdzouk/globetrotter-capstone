# DEPLOYMENT.md

## Requirements

- Ubuntu 22.04/24.04 LTS VPS (2GB RAM minimum)
- Docker + Docker Compose plugin installed
- A domain pointed at the VPS (for HTTPS)
- Optional: Cloudflare in front, for DNS/WAF/CDN (see the "Cloudflare" section below)

### Contabo-specific notes

Contabo VPS instances ship with Ubuntu pre-installed but **no cloud
firewall in front by default** (unlike some providers where the
platform firewall is a separate layer) — the VPS's own `ufw` rules
(set up below) are your actual first line of defense here, not
optional. A few Contabo specifics:

- **Root login by default**: Contabo emails you root credentials
  directly. Create a non-root sudo user immediately and disable root
  SSH login (covered in the SSH hardening step below) — don't run
  Docker as root long-term.
- **Reverse DNS / hostname**: Contabo's default hostname is often
  something like `vmiXXXXXX.contaboserver.net`. This doesn't affect
  functionality but if you want clean `hostname`/mail-sending
  behavior later, set it via their control panel.
- **IPv6**: Contabo VPS plans typically include a /64 IPv6 block. Not
  required for this app, but if you point AAAA records at it too,
  make sure `ufw` rules apply to IPv6 as well (they do by default on
  modern Ubuntu, just worth confirming with `ufw status verbose`).
- Everything else below (Docker install, firewall, HTTPS, deploy) is
  standard Ubuntu LTS and needs no Contabo-specific changes.

## First-time VPS setup

```bash
# As root or with sudo:
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin git ufw fail2ban unattended-upgrades

# Firewall: only 22 (SSH), 80, 443 are public. Nothing else.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Automatic security updates
dpkg-reconfigure --priority=low unattended-upgrades

# SSH: disable password auth, key-only (edit /etc/ssh/sshd_config):
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password
systemctl restart sshd
```

## Clone and configure

```bash
mkdir -p /opt/globetrotter && cd /opt/globetrotter
git clone <your-repo-url> .
cd globetrotter-monolith
cp .env.example .env
nano .env   # fill in real JWT_SECRET, POSTGRES_PASSWORD, CORS_ORIGINS
```

Generate a real secret:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## First deploy

```bash
docker compose build
docker compose run --rm backend alembic upgrade head   # create the schema
docker compose run --rm backend python seed_destinations.py   # seed the 58 places
docker compose up -d
```

Verify:
```bash
curl http://localhost/health
curl http://localhost/api/destinations | head -c 200
```

## HTTPS (Let's Encrypt)

```bash
apt install -y certbot
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```
Then in `nginx/nginx.conf`: uncomment the 443 server block, fill in your domain, uncomment the HTTP→HTTPS redirect in the 80 block, and mount the cert volume in `docker-compose.yml` (already stubbed there, commented out). Restart:
```bash
docker compose restart nginx
```
Set up renewal (`certbot renew` via cron/systemd timer — certbot's own package usually handles this automatically).

## Cloudflare (optional)

Point your domain's DNS at Cloudflare, then your VPS. Cloudflare handles DDoS protection, CDN caching of static assets, and can terminate TLS itself ("Flexible" mode, simplest) or pass through to your own cert ("Full (strict)", more secure, requires the Let's Encrypt setup above). The app has no Cloudflare-specific dependency — it works identically with or without it in front.

## Subsequent deploys

Either push to `main` (triggers `.github/workflows/deploy.yml`, see its comments for the required GitHub secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`), or manually:

```bash
cd /opt/globetrotter
git pull origin main
docker compose build
docker compose run --rm backend alembic upgrade head
docker compose up -d --wait
curl -f http://localhost/health
```

`docker compose up -d --wait` only replaces old containers with new ones once the new ones pass their health checks — see "Safe Deployment" below for what happens if that fails.

## Safe deployment / rollback

The deploy sequence above (pull → build → migrate → health-checked restart) never takes the app offline to deploy, and never leaves it broken:
- If `alembic upgrade head` fails, deployment stops there — old containers are still running, untouched.
- If the new backend container fails its health check, `docker compose up -d --wait` will not consider the deploy complete, and the previous containers remain serving traffic.
- **Application rollback**: `git checkout <previous-commit> && docker compose build && docker compose up -d --wait`.
- **Database migration rollback**: `docker compose run --rm backend alembic downgrade -1` reverts the most recent migration. Only do this if you're sure no data written under the new schema needs preserving — read the migration file first.
- **Docker image rollback**: images aren't currently tagged/pushed to a registry in this setup (they're built locally on the VPS from source) — rolling back the code via git and rebuilding is the rollback mechanism.
- **Config rollback**: keep `.env` in your own secure backup (never in git) so you can restore a previous value if a config change causes problems.

## Friends, Voice Notes and Community Photos

Before deploying this update, take a database backup, build the updated images, and run `docker compose run --rm backend alembic upgrade head`. Revision `20260919_social_places` adds four tables without replacing existing data. Its downgrade intentionally refuses to erase messages and uploaded photos.

The backend requirements now include Pillow for image normalization and PyAV for bounded audio decoding. Their packaged wheels provide the required media libraries on supported Python platforms. Media lives in the database, so existing PostgreSQL backups include it; allow for larger backups and never expose those backups publicly. No writable upload directory needs mounting in the container.

Deploy the updated Nginx configuration with its 9 MB request cap and `Cross-Origin-Opener-Policy: same-origin-allow-popups` header. Keep `/api/` uncached and on the frontend origin. HTTPS is required for microphone capture and Google sign-in on deployed origins. Local microphone capture works on `localhost` but normally not on a plain HTTP LAN address.

Configure `GOOGLE_CLIENT_ID` in the private monolith `.env` with your Google Cloud **Web application** OAuth client ID, authorize the deployed HTTPS origin in Google Auth Platform, and complete consent-screen setup. No Google client secret or Maps API key is needed. Restart the backend after changes. The step-by-step [Google sign-in setup](../frontend/README.md#google-sign-in-and-sign-up) includes local origins and verification steps. Automated tests substitute Google responses; a real account consent test must be completed by the project owner.

Verify `/api/health` and `/api/ready` through the frontend proxy, then check a friend request between two test accounts, private voice playback, an attributed place submission, and a photo on an existing place. These actions create real records; use accounts and content intended for testing. Review storage, rate limits and moderation needs before opening contributions to a large public audience.

## Environment Variables Reference

See `backend/.env.example` (app-level) and `.env.example` at the repo root (docker-compose-level — Postgres credentials, JWT secret, CORS origins).
