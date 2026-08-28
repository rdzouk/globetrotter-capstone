#!/bin/bash
# Launches all 4 services locally (no Docker) for development/testing.
# Each service gets its own venv on first run. Logs go to /tmp/gt-*.log.
# Run ./stop_all.sh to shut everything down.

set -e
cd "$(dirname "$0")"

export JWT_SECRET="dev-secret-change-me"

start_service() {
    local name=$1
    local dir=$2
    local port=$3
    echo "Starting $name on port $port..."
    (
        cd "$dir"
        if [ ! -d .venv ]; then
            python3 -m venv .venv
        fi
        . .venv/bin/activate
        pip install -q -r requirements.txt
        PORT=$port python app.py > "/tmp/gt-$name.log" 2>&1 &
        echo $! > "/tmp/gt-$name.pid"
    )
}

start_service user-service ./user-service 5001
start_service itinerary-service ./itinerary-service 5002
start_service recommendation-service ./recommendation-service 5003

sleep 2

echo "Starting api-gateway on port 5000..."
(
    cd api-gateway
    if [ ! -d .venv ]; then
        python3 -m venv .venv
    fi
    . .venv/bin/activate
    pip install -q -r requirements.txt
    USER_SERVICE_URL=http://localhost:5001 \
    ITINERARY_SERVICE_URL=http://localhost:5002 \
    RECOMMENDATION_SERVICE_URL=http://localhost:5003 \
    PORT=5000 \
    python app.py > /tmp/gt-api-gateway.log 2>&1 &
    echo $! > /tmp/gt-api-gateway.pid
)

sleep 2
echo ""
echo "All services started. Gateway: http://localhost:5000"
echo "Logs: /tmp/gt-*.log   Stop with: ./stop_all.sh"
