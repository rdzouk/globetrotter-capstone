#!/bin/bash
# GlobeTrotter Deployment Script for Contabo VPS
# Copy and paste each section into your terminal

# ============================================================
# STEP 1: SSH INTO YOUR VPS
# ============================================================
# Run this on YOUR computer (not the VPS yet):
# ssh root@169.58.83.56

# ============================================================
# STEP 2: INITIAL SETUP (run as root on VPS)
# ============================================================
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin git ufw fail2ban unattended-upgrades

# Enable firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Automatic security updates
dpkg-reconfigure --priority=low unattended-upgrades

# Start Docker
systemctl start docker
systemctl enable docker

echo "✓ Step 2 complete: Server hardened and Docker installed"

# ============================================================
# STEP 3: DISABLE ROOT LOGIN (optional but recommended)
# ============================================================
# Edit this file:
# nano /etc/ssh/sshd_config
# 
# Change these lines:
# PasswordAuthentication no
# PermitRootLogin prohibit-password
#
# Then save (Ctrl+O, Enter, Ctrl+X) and restart:
# systemctl restart sshd

# ============================================================
# STEP 4: CLONE YOUR REPO
# ============================================================
mkdir -p /opt/globetrotter
cd /opt/globetrotter
git clone https://github.com/YOUR_USERNAME/globetrotter-capstone.git .
cd globetrotter-monolith

echo "✓ Repository cloned to /opt/globetrotter"

# ============================================================
# STEP 5: CREATE .env FILE
# ============================================================
# Generate secrets first (run these commands):
python3 -c "import secrets; print('JWT_SECRET=' + secrets.token_hex(32))"
python3 -c "import secrets; print('DB_PASSWORD=' + secrets.token_hex(16))"

# Then create the file:
cat > .env << 'EOF'
APP_ENV=production
JWT_SECRET=YOUR_JWT_SECRET_HERE
POSTGRES_USER=globetrotter_user
POSTGRES_PASSWORD=YOUR_DB_PASSWORD_HERE
POSTGRES_DB=globetrotter_prod
REDIS_URL=redis://redis:6379/0
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
LOG_LEVEL=INFO
EOF

# Edit with your actual values:
nano .env

echo "✓ .env file created"

# ============================================================
# STEP 6: BUILD AND DEPLOY
# ============================================================
docker compose build

# Create database
docker compose run --rm backend alembic upgrade head

# Seed 58 places
docker compose run --rm backend python seed_destinations.py

# Start all services
docker compose up -d

echo "✓ Docker deployment started!"

# ============================================================
# STEP 7: VERIFY DEPLOYMENT
# ============================================================
echo ""
echo "Checking if services are running..."
docker compose ps

echo ""
echo "Checking backend health..."
curl http://localhost/health

echo ""
echo "View logs with: docker compose logs -f"
echo "View specific service: docker compose logs -f backend"

# ============================================================
# STEP 8: HTTPS SETUP (optional)
# ============================================================
# If you want HTTPS, run:
# apt install -y certbot python3-certbot-nginx
# certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
# Then update nginx/nginx.conf to use the certificates

echo ""
echo "=========================================="
echo "✓ Deployment Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Point your domain DNS to: 169.58.83.56"
echo "2. Wait 5-10 minutes for DNS to propagate"
echo "3. Visit: http://yourdomain.com or http://169.58.83.56"
echo "4. For HTTPS: Run certbot (see above)"
echo ""
echo "Monitor logs with: docker compose logs -f"
