#!/usr/bin/env bash
#
# เปิด stack เต็มของ sensor-registry ผ่าน docker แล้วเช็คพอร์ตให้
#
#   - mongo (27017), mosquitto (1883 + 9001)
#   - backend (3001 -> 3000), frontend/nginx (3000 -> 80)
# prod บังคับ ADMIN_KEY — ตั้งใน .env ที่ repo root หรือ env var ก่อนรัน
#
# ใช้งาน:
#   ./scripts/start-all.sh                 # localhost
#   ./scripts/start-all.sh 192.168.149.185 # เช็คพอร์ตจากมุม LAN ตอนจบ

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_HOST="${1:-localhost}"

echo
echo "  เปิด docker stack ของ sensor-registry..."
echo "  ------------------------------------------------------------"

( cd "$REPO_ROOT" && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d )

echo "  ------------------------------------------------------------"
echo "  รอ container พร้อม ~5 วินาที..."
sleep 5

exec "$SCRIPT_DIR/check-ports.sh" "$TARGET_HOST"
