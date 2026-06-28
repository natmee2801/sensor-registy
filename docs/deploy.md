# Production deployment

วิธี deploy ทั้ง stack (Mongo + Mosquitto + Backend + Frontend) ด้วย Docker Compose บนเครื่องเดียว เหมาะกับ LAN deployment ที่บ้าน/สำนักงาน ที่ต้องให้ ESP ใน subnet เดียวกันคุย MQTT broker ได้

## Architecture

```
┌─ host ─────────────────────────────────────────────────────────────┐
│                                                                    │
│   :3000 ──► [ frontend ]  nginx serve static (Vue build)           │
│                  │         + reverse proxy /api → backend:3000     │
│                  │                                                  │
│                  ▼ (docker network)                                 │
│   :3001 ──► [ backend  ]  Express + tsx                             │
│                  │         ├─► mongo:27017                          │
│                  │         └─► mosquitto:1883                       │
│                  ▼                                                  │
│   :27017 ─► [ mongo    ]  MongoDB 7 (volume: mongo-data)            │
│                                                                    │
│   :1883  ─► [ mosquitto ] MQTT broker (volume: mosquitto-data/log) │
│   :9001  ─► (mosquitto ws debug)                                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
            ▲
            │ MQTT 1883 (LAN)
       [ ESP8266 lights ]
```

- Frontend และ Backend อยู่ใน docker network เดียวกัน → frontend nginx proxy `/api` ผ่าน DNS ภายใน (`backend:3000`) ไม่ผ่าน host
- Backend ยัง expose host port 3001 ไว้สำหรับ debug/curl โดยตรง
- MQTT broker 1883 ต้อง expose ออก host เพื่อให้ ESP ต่อจาก LAN

## Prerequisites

- Docker Desktop (Windows/Mac) หรือ Docker Engine + Compose v2 (Linux)
- Free ports: **3000** (frontend), **3001** (backend), **27017** (mongo), **1883** (mqtt), **9001** (mqtt ws)

## Setup

### 1. ตั้งค่า environment

ที่ root ของ repo:

```sh
cp .env.example .env
```

แก้ `.env` ตั้งค่า `ADMIN_KEY` (ใช้สำหรับเรียก admin endpoint เช่น `POST /api/admin/archive-logs`):

```
ADMIN_KEY=<random-strong-secret>
```

> ❗ ต้องไม่ปล่อยเป็นค่า default `change-me-in-production` — compose จะ start ผ่านก็จริง แต่ admin endpoint จะถูกใช้ผ่าน secret ที่เดาง่าย

### 2. Build + start

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

ครั้งแรก build ใช้เวลา ~30–60 วินาที (download base images + npm install). รอบหลัง compose จะ cache layer.

### 3. ตรวจสถานะ

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

ต้องเห็นครบ 4 ตัว สถานะ `Up`:

```
sensor-registry-frontend    ...    0.0.0.0:3000->80/tcp
sensor-registry-backend     ...    0.0.0.0:3001->3000/tcp
sensor-registry-mongo       ...    0.0.0.0:27017->27017/tcp
sensor-registry-mosquitto   ...    0.0.0.0:1883->1883/tcp, 0.0.0.0:9001->9001/tcp
```

ตรวจ backend log ว่าต่อ mongo + mqtt สำเร็จ:

```sh
docker logs sensor-registry-backend
# คาดหวัง:
#   mongo: connected
#   mqtt connected
#   express: listening on 3000
```

### 4. เปิดใช้งาน

- เปิด browser → `http://localhost:3000` (หรือ `http://<host-lan-ip>:3000` จากเครื่องอื่นใน LAN)
- ESP8266 → ตั้งค่า `MQTT_HOST=<host-lan-ip>`, `MQTT_PORT=1883` ใน `microcontroller/automate_nodemcu_light/src/secrets.h`

## Verification

```sh
# Frontend serve static
curl -I http://localhost:3000/
# → HTTP/1.1 200 OK   Server: nginx/...

# REST API ผ่าน nginx proxy → backend (same-origin)
curl http://localhost:3000/api/devices
# → []   (ครั้งแรก devices ว่าง)

# SSE stream
curl -N http://localhost:3000/api/events
# → retry: 3000
#   : ping    (ทุก 25s)

# Backend host port direct (debug)
curl http://localhost:3001/api/devices
```

## การจัดการ stack

```sh
# Logs realtime (ทั้งหมด หรือ service เดียว)
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend

# Restart service เดียว (เช่น หลังแก้ env)
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend

# Rebuild หลัง code update (pull + rebuild + recreate)
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Stop ทั้งหมด (ข้อมูลใน volume ยังอยู่)
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# ลบทุกอย่างรวม data (⚠ device + log หาย)
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```

## Customization

### เปลี่ยน port

แก้ `docker-compose.prod.yml`:

```yaml
frontend:
  ports:
    - "8080:80"        # เปลี่ยน host port frontend
backend:
  ports:
    - "8081:3000"      # เปลี่ยน host port backend
  environment:
    FRONTEND_URL: http://localhost:8080   # ต้อง sync ด้วย
```

### Expose ออก LAN (ปกติ Docker ทำให้แล้ว)

`0.0.0.0:3000` หมายถึง bind ทุก interface — เครื่องอื่นใน LAN เข้าผ่าน `http://<host-lan-ip>:3000` ได้เลย ถ้า firewall ของ host ไม่บล็อก

### Multi-origin CORS

ถ้าผู้ใช้เข้าจากหลาย host (เช่น `localhost:3000` + LAN IP) แก้ `docker-compose.prod.yml`:

```yaml
environment:
  FRONTEND_URL: http://localhost:3000,http://192.168.1.10:3000
```

Backend แยก origin ด้วย comma (ดู `application/backend/src/app.ts`)

### Mosquitto auth (lock down anonymous)

ปัจจุบัน `mosquitto.conf` ตั้ง `allow_anonymous true`. ถ้าจะปิด:

1. แก้ `mosquitto/config/mosquitto.conf`: `allow_anonymous false` + เพิ่ม `password_file /mosquitto/config/passwd`
2. สร้าง password file: `docker exec -it sensor-registry-mosquitto mosquitto_passwd -c /mosquitto/config/passwd <user>`
3. ตั้ง `MQTT_USERNAME` + `MQTT_PASSWORD` ใน backend service ของ `docker-compose.prod.yml`
4. แก้ ESP firmware ให้ส่ง credentials ตอน connect

## Troubleshooting

### `localhost:3000` ตอบจากแอปอื่น (port conflict)

ถ้ามี Node/Nuxt/แอป dev อื่นรันบน 3000 อยู่ก่อน (โดยเฉพาะที่ bind IPv6 `[::1]`) จะตอบทับ Docker เพราะ OS resolve `localhost` เป็น IPv6 ก่อน

ตรวจ:
```sh
# Windows
netstat -ano | findstr :3000

# macOS/Linux
lsof -iTCP:3000 -sTCP:LISTEN
```

แก้:
- ใช้ `http://127.0.0.1:3000` (บังคับ IPv4 ผ่าน Docker)
- หรือหยุดแอปที่ค้าง (`Stop-Process -Id <pid>` / `kill <pid>`)
- หรือเปลี่ยน host port ในส่วน Customization

### Backend log ขึ้น `mqtt initial connect failed`

ปกติคือ mosquitto ยังไม่ ready ตอน backend boot — backend จะ retry เอง ดู log ถัดไปจะเห็น `mqtt connected`. ถ้าค้างเกิน 30s:

```sh
docker logs sensor-registry-mosquitto
docker exec sensor-registry-backend wget -qO- http://mosquitto:1883 2>&1 || echo "cannot reach mosquitto"
```

### Frontend เห็นหน้าแต่ `/api/devices` คืน HTML

แปลว่า nginx ไม่ได้ proxy `/api` (อาจ config หาย หรือ container ใช้ image เก่า). Rebuild:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache frontend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend
```

### SSE หลุดบ่อย / EventSource reconnect loop

- ถ้าผ่าน reverse proxy ภายนอก (Caddy/Traefik/Cloudflare) ต้องตั้ง buffering off + read timeout > 30s
- ปัจจุบัน `application/frontend/nginx.conf` ตั้ง `proxy_buffering off` + `proxy_read_timeout 24h` ไว้แล้ว — heartbeat `: ping` ทุก 25s จาก `controllers/events.controller` กัน idle ของ proxy ชั้นอื่นได้ระดับนึง

### ESP ต่อ broker ไม่ได้

- ESP ต้องอยู่ subnet เดียวกับ host ที่ run Docker (Docker NAT ออก LAN ปกติ — ESP ต่อตรงเข้า host port 1883)
- ตรวจ `MQTT_HOST` ใน `secrets.h` เป็น LAN IP ของเครื่อง host (ไม่ใช่ `localhost`/`127.0.0.1`)
- ตรวจ firewall ของ host เปิด inbound port 1883
- Debug ด้วย `mosquitto_sub -h <host-ip> -t 'pair/hello'` จากเครื่องอื่นใน LAN

## Notes

- Dev workflow (`docker compose up -d` แบบไม่มี `-f docker-compose.prod.yml`) ยังขึ้นแค่ mongo + mosquitto เหมือนเดิม backend/frontend ยังรันด้วย `npm run dev` ได้ตามปกติ
- Backend image รัน `tsx` ตรง ๆ ไม่มี build step (สอดคล้องกับ `CLAUDE.md` conventions) — image จึงรวม devDependencies ไว้ด้วย ขนาดประมาณ 300 MB
- ไม่มี HTTPS / domain ในตัว — ถ้าจะ deploy ออก internet แนะนำใช้ Caddy/Traefik/Cloudflare Tunnel หน้า frontend container
