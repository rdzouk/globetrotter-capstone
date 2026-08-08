#!/bin/bash
for name in user-service itinerary-service recommendation-service api-gateway; do
    pidfile="/tmp/gt-$name.pid"
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        if kill "$pid" 2>/dev/null; then
            echo "Stopped $name (pid $pid)"
        fi
        rm -f "$pidfile"
    fi
done
