#!/usr/bin/env bash
#
# เช็คสถานะบริการของ sensor-registry "ตาม docker" — ดึงพอร์ตจาก docker compose โดยตรง
#
# อ่าน `docker compose ps` (base + prod overlay) แล้วสำหรับแต่ละ service:
#   - แสดง State ของ container (running / อื่นๆ)
#   - ดึงพอร์ตที่ publish ออก host จริงจาก compose (ไม่ hardcode)
#   - ทดสอบ TCP ไปยังพอร์ตนั้นบน host ที่ระบุ
#
# ใช้งาน:
#   ./scripts/check-ports.sh                    # เช็ค localhost
#   ./scripts/check-ports.sh 192.168.149.185    # เช็คจากมุมของ ESP/LAN
#
# ต้องมี: docker, bash (ใช้ /dev/tcp) — ไม่ต้องพึ่ง jq

set -euo pipefail

TARGET_HOST="${1:-localhost}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# สี (ปิดอัตโนมัติถ้า output ไม่ใช่ terminal)
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; CYAN=$'\033[36m'; NC=$'\033[0m'
else
  RED=; GREEN=; YELLOW=; DIM=; CYAN=; NC=
fi

command -v docker >/dev/null 2>&1 || { echo "${RED}ไม่พบ docker — ติดตั้ง Docker ก่อน${NC}"; exit 2; }

COMPOSE=(docker compose
  -f "$REPO_ROOT/docker-compose.yml"
  -f "$REPO_ROOT/docker-compose.prod.yml")

# ทดสอบ TCP หนึ่งพอร์ต — คืน 0 ถ้าเปิด, ไม่ใช่ 0 ถ้าปิด (timeout 2s ถ้ามี `timeout`)
test_port() {
  local host="$1" port="$2"
  if command -v timeout >/dev/null 2>&1; then
    timeout 2 bash -c "exec 3<>/dev/tcp/$host/$port" >/dev/null 2>&1
  else
    bash -c "exec 3<>/dev/tcp/$host/$port" >/dev/null 2>&1
  fi
}

echo
echo "  เช็คบริการ sensor-registry ตาม docker — host: ${CYAN}${TARGET_HOST}${NC}"
echo "  ------------------------------------------------------------"

# service|state|published ports (space-separated, มีซ้ำจาก IPv4/IPv6)
rows="$("${COMPOSE[@]}" ps --all \
  --format '{{.Service}}|{{.State}}|{{range .Publishers}}{{.PublishedPort}} {{end}}' 2>/dev/null || true)"

if [ -z "$rows" ]; then
  echo "  ${YELLOW}ไม่มี container เลย — ยังไม่ได้ up? หรือ docker ไม่ทำงาน${NC}"
  echo "  ${DIM}-> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d${NC}"
  echo
  exit 1
fi

all_good=1

while IFS='|' read -r service state ports; do
  [ -z "$service" ] && continue

  if [ "$state" = "running" ]; then
    printf "  %s[ UP  ]%s %-10s %s\n" "$GREEN" "$NC" "$service" "$state"
  else
    printf "  %s[ DOWN]%s %-10s %s\n" "$RED" "$NC" "$service" "$state"
    all_good=0
  fi

  # dedupe + เรียงพอร์ต (0 = ไม่ publish -> ตัดออก)
  uniq_ports="$(echo "$ports" | tr ' ' '\n' | grep -E '^[0-9]+$' | grep -v '^0$' | sort -un || true)"

  if [ -z "$uniq_ports" ]; then
    printf "           %s(ไม่ publish พอร์ตออก host)%s\n" "$DIM" "$NC"
    continue
  fi

  while read -r port; do
    [ -z "$port" ] && continue
    if test_port "$TARGET_HOST" "$port"; then
      printf "           port %-6s %sOPEN%s\n" "$port" "$GREEN" "$NC"
    else
      printf "           port %-6s %sCLOSED%s\n" "$port" "$RED" "$NC"
      all_good=0
    fi
  done <<< "$uniq_ports"
done <<< "$rows"

echo "  ------------------------------------------------------------"
if [ "$all_good" -eq 1 ]; then
  echo "  ${GREEN}ทุก container running และพอร์ตเปิดครบ${NC}"
  echo
  exit 0
else
  echo "  ${YELLOW}มี container/พอร์ตที่ยังไม่พร้อม${NC}"
  echo "  ${DIM}-> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d${NC}"
  echo
  exit 1
fi
