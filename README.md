# sensor-registry

ระบบควบคุมหลอดไฟผ่าน MQTT — backend เป็น single source of truth, ESP8266
firmware รับคำสั่งเปิด/ปิดและส่ง heartbeat กลับ, frontend ดู realtime ผ่าน SSE

```
sensor-registy/
├── application/
│   ├── frontend/                          Vue 3 + Vite + Pinia (TypeScript)
│   └── backend/                           Express + Mongoose + zod + mqtt (TypeScript)
├── microcontroller/
│   └── automate_nodemcu_light/            ESP8266 firmware (PlatformIO + PubSubClient)
├── mosquitto/config/mosquitto.conf        broker config
├── docker-compose.yml                     MongoDB 7 + Mosquitto 2 (dev infra)
├── docker-compose.prod.yml                + backend + frontend (production overlay)
└── CLAUDE.md                              สถาปัตยกรรม / event flow / topic table
```

## เริ่มต้นใช้งาน (dev)

ต้องมี: Node.js 22+, npm, Docker. (firmware: PlatformIO + NodeMCU v2)

```sh
# 1. เริ่ม MongoDB + Mosquitto
docker compose up -d

# 2. backend (terminal ที่ 1)
cd application/backend
cp .env.example .env
npm install
npm run dev
# → http://localhost:3000   (REST + SSE + MQTT client)

# 3. frontend (terminal ที่ 2)
cd application/frontend
npm install
npm run dev
# → http://localhost:5173
```

## Production deployment

รันทั้ง stack ใน Docker (frontend nginx serve + proxy /api → backend):

```sh
cp .env.example .env   # ตั้ง ADMIN_KEY
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# → frontend http://localhost:3000   (proxy /api ไป backend container)
# → backend  http://localhost:3001   (debug direct)
```

วิธี deploy เต็ม + verification + troubleshooting ดู [`docs/deploy.md`](./docs/deploy.md)

## การเชื่อม device จริง (Announce & Claim)

ไม่ต้องคิด device_id เอง — ESP บูทแล้วประกาศ MAC, claim จาก UI

1. Flash firmware ตาม [`microcontroller/README.md`](./microcontroller/README.md)
2. ESP บูท → ต่อ WiFi (WiFiManager captive portal ครั้งแรก) → publish `pair/hello` ทุก 5s
3. เปิดเว็บ → tab **Pairing** → เจอ device โผล่ → กด **Claim** → ใส่ location
4. Backend gen device_id (`light-<mac6>`) → publish retained `pair/ack/{mac}` → ESP เขียน id ลง LittleFS → reboot เข้าโหมด paired

ลบ device จาก UI = clear retained ack + LWT ใน broker (ESP ที่ erase flash แล้วจะ re-pair ได้สะอาด)

## MQTT topics (สรุปย่อ)

| Topic | Direction | Retained | Payload |
|-------|-----------|----------|---------|
| `pair/hello` | ESP → backend | no | `{mac, model, fw}` |
| `pair/ack/{mac}` | backend → ESP | **yes** | `{device_id}` |
| `dev/{id}/cmd` | backend → ESP | no | `{cmd_id, action, isOn, ts}` |
| `dev/{id}/ack` | ESP → backend | no | `{cmdId, status, isOn}` |
| `dev/{id}/hb` | ESP → backend | yes | `{isOn, rssi, uptime}` (ทุก 30s) |
| `dev/{id}/lwt` | broker → backend | yes | `"offline"` (LWT) |

รายละเอียดเต็ม + flow diagram ดู [`CLAUDE.md`](./CLAUDE.md) (ASCII) หรือ [`docs/flows.md`](./docs/flows.md) (Mermaid — render บน GitHub)

## State semantics

- **`state.isOn`** = last known intent/state (optimistic; sync กลับด้วย `hb_sync` จาก heartbeat)
- **`state.isOnline`** = backend เคยได้ยิน device ใน window ล่าสุด
- Online detection:
  - LWT (~60-90s หลัง TCP disconnect)
  - `cmd_timeout` → mark offline ทันที (~5s) ถ้า publish cmd แล้วไม่ ack
  - stale-heartbeat tick (~30s) ถ้า `lastSeenAt` เก่ากว่า `HEARTBEAT_GRACE_MS`
- Toggle ขณะ device offline = 409 StateError (UI disable ปุ่มอยู่แล้ว)

## Type-check

```sh
npm --prefix application/backend run type-check
npm --prefix application/frontend run type-check
```

## โครงการย่อย

- [`application/frontend/`](./application/frontend) — UI: list / detail control / history / pairing tab
- [`application/backend/`](./application/backend) — REST + SSE + MQTT client + tick/archive jobs
- [`microcontroller/automate_nodemcu_light/`](./microcontroller/automate_nodemcu_light) — ESP8266 firmware
