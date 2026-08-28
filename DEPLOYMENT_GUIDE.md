# 🚀 GlobeTrotter Deployment Guide - Contabo VPS

## 📋 What You Have

Your project has **TWO Docker setups**:

| Setup | Location | Use Case | Status |
|-------|----------|----------|--------|
| **Simple** | `./Dockerfile` + `docker-compose.yml` | Development/Testing | ✅ Works |
| **Production** | `./globetrotter-monolith/docker-compose.yml` | Live VPS | ✅ **READY** |

**Recommendation:** Use the **Production setup** (monolith) for Contabo deployment.

---

## 🔐 Contabo VPS Setup (Step-by-Step)

### Step 1: SSH Into Your VPS

```bash
ssh root@your_contabo_ip
# Enter password from Contabo email
```

### Step 2: Initial Server Hardening

```bash
# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y docker.io docker-compose-plugin git ufw fail2ban unattended-upgrades

# Enable firewall (SSH, HTTP, HTTPS only)
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Enable automatic security updates
dpkg-reconfigure --priority=low unattended-upgrades

# Start Docker
systemctl start docker
systemctl enable docker
```

### Step 3: Disable Root Login & Set Up SSH Key

Edit `/etc/ssh/sshd_config`:
```bash
nano /etc/ssh/sshd_config
```

Change these lines:
```
PasswordAuthentication no
PermitRootLogin prohibit-password
```

Restart SSH:
```bash
systemctl restart sshd
```

### Step 4: Create Non-Root User (Important!)

```bash
adduser appuser
usermod -aG docker appuser
su - appuser
```

### Step 5: Clone Your Repository

```bash
mkdir -p /opt/globetrotter && cd /opt/globetrotter
git clone https://github.com/YOUR_USERNAME/globetrotter-capstone.git .
cd globetrotter-monolith
```

### Step 6: Configure Environment Variables

```bash
cp backend/.env.example .env
nano .env
```

Fill in **these values** (keep all others as shown):

```bash
APP_ENV=production
JWT_SECRET=<RUN THIS: python3 -c "import secrets; print(secrets.token_hex(32))">
POSTGRES_USER=globetrotter_user
POSTGRES_PASSWORD=<GENERATE_STRONG_PASSWORD>
POSTGRES_DB=globetrotter_prod
REDIS_URL=redis://redis:6379/0
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
LOG_LEVEL=INFO
```

Generate secrets:
```bash
python3 -c "import secrets; print('JWT_SECRET=' + secrets.token_hex(32))"
python3 -c "import secrets; print('DB_PASSWORD=' + secrets.token_hex(16))"
```

### Step 7: Deploy with Docker Compose

```bash
# Build containers
docker compose build

# Create database schema
docker compose run --rm backend alembic upgrade head

# Seed the 58 Yaoundé places
docker compose run --rm backend python seed_destinations.py

# Start all services
docker compose up -d

# Verify it's running
docker compose logs -f
```

### Step 8: Verify Deployment

```bash
# Check if backend is healthy
curl http://localhost/health

# Check all containers
docker compose ps

# View logs
docker compose logs backend
docker compose logs nginx
```

---

## 🌐 HTTPS Setup (Let's Encrypt)

### Option 1: Using Certbot (Recommended)

```bash
# Install certbot
apt install -y certbot python3-certbot-nginx

# Get certificate
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Update nginx config
nano nginx/nginx.conf

# Uncomment HTTPS lines and update paths
# Then restart
docker compose restart nginx
```

### Option 2: Point Domain → Contabo IP

1. Go to your domain registrar (Namecheap, GoDaddy, etc.)
2. Add DNS A record: `yourdomain.com` → `your_contabo_ip`
3. Add DNS CNAME: `www.yourdomain.com` → `yourdomain.com`
4. Wait 5-10 minutes for DNS to propagate
5. Then run Certbot above

---

## 📊 Database Backup/Restore

### Backup PostgreSQL

```bash
docker compose exec postgres pg_dump -U globetrotter_user globetrotter_prod > backup.sql
```

### Restore from Backup

```bash
docker compose exec -T postgres psql -U globetrotter_user globetrotter_prod < backup.sql
```

---

## 🔄 Updates & Maintenance

### Deploy New Code

```bash
cd /opt/globetrotter/globetrotter-monolith
git pull origin main
docker compose build
docker compose up -d --no-deps --build backend
docker compose logs -f
```

### Monitor Logs

```bash
# Real-time
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f nginx

# With timestamps
docker compose logs -f --timestamps
```

### Restart Services

```bash
# Single service
docker compose restart backend

# All services
docker compose restart
```

### Check Resource Usage

```bash
docker stats
```

---

## ⚠️ Important Security Notes

1. **Never commit `.env`** - Already in `.gitignore`
2. **Use strong passwords** - 32+ character random strings
3. **Keep Docker updated**:
   ```bash
   apt update && apt upgrade -y
   ```
4. **Monitor logs regularly** - Check for errors/attacks
5. **Backup database weekly**:
   ```bash
   0 2 * * 0 cd /opt/globetrotter/globetrotter-monolith && docker compose exec -T postgres pg_dump -U globetrotter_user globetrotter_prod > backups/backup_$(date +\%Y\%m\%d).sql
   ```

---

## 📞 About Server Access

**I cannot directly access your Contabo server**, but I can help you:
- ✅ Write deployment commands
- ✅ Debug error logs you share with me
- ✅ Fix configuration issues
- ✅ Optimize Docker setup
- ✅ Troubleshoot connectivity

**To debug together:** Copy error output from `docker compose logs` and paste here!

---

## 🚨 Troubleshooting

### Container keeps restarting

```bash
docker compose logs backend
```

### Port 80/443 already in use

```bash
lsof -i :80
kill -9 <PID>
```

### Database connection failed

```bash
docker compose exec postgres psql -U globetrotter_user -c "SELECT version();"
```

### Out of disk space

```bash
docker system prune -a  # Remove unused images
docker volume prune     # Remove unused volumes
df -h                   # Check disk usage
```

---

## ✅ Deployment Checklist

- [ ] VPS firewall configured (22, 80, 443)
- [ ] SSH keys set up (no password auth)
- [ ] Non-root user created
- [ ] Repository cloned
- [ ] `.env` file created with real secrets
- [ ] Docker Compose build successful
- [ ] Database initialized (`alembic upgrade head`)
- [ ] Places seeded (`seed_destinations.py`)
- [ ] `docker compose up -d` running
- [ ] `curl http://localhost/health` returns 200
- [ ] Domain DNS points to VPS IP
- [ ] HTTPS certificate installed
- [ ] Backup script scheduled

**Once all checked:** Your app is live! 🎉

