# sensor-registry

ระบบควบคุมหลอดไฟผ่าน MQTT — backend เป็น single source of truth, ESP8266 firmware (NodeMCU) คุย MQTT รับคำสั่งเปิด/ปิดและส่ง ack/heartbeat กลับ. Frontend ดู realtime ผ่าน SSE

**Stack:** Vue 3 (beta) + Pinia + Vite 8 (frontend) · Express 5 + Mongoose 8 + zod + mqtt (backend) · MongoDB 7 + Mosquitto 2 (Docker) · TypeScript ทั้งสองฝั่ง · ESP8266 + PlatformIO + PubSubClient + WiFiManager (firmware)

## Layout

```
application/
├── frontend/                          Vue SPA — http://localhost:5173
└── backend/                           REST + SSE + MQTT client — http://localhost:3000
microcontroller/
└── automate_nodemcu_light/            ESP8266 firmware (PlatformIO)
mosquitto/config/mosquitto.conf        broker config
docker-compose.yml                     Mongo 7 + Mosquitto 2
```

ไม่ใช้ npm workspaces — ติดตั้ง/รันแยกต่อ project

## Dev commands

```sh
docker compose up -d                            # MongoDB + Mosquitto
npm --prefix application/backend run dev        # tsx watch src/server.ts
npm --prefix application/frontend run dev       # vite
npm --prefix application/backend run type-check # tsc --noEmit
npm --prefix application/frontend run type-check # vue-tsc --build

# firmware
cd microcontroller/automate_nodemcu_light
cp src/secrets.h.example src/secrets.h          # แก้ MQTT_HOST + WIFI_SSID/PASSWORD
pio run -t upload
pio device monitor                              # baud 115200
```

Backend ใช้ `tsx` ตรงๆ ไม่มี build step — import path ใน backend/src/ ใช้ `.ts` extension เสมอ (เช่น `from './events.ts'`)

## Architecture

> Mermaid version ของ flow ทั้งหมด render ได้ที่ [`docs/flows.md`](./docs/flows.md) — ASCII ในไฟล์นี้สำหรับ terminal/quick reference

### Event flow (state changes)

Backend เป็น single source of truth. ทุก state mutation วิ่งผ่าน path เดียว แล้ว push ไปทุก client ที่ connect ผ่าน SSE — frontend ไม่ poll

```
[ user click / cron tick / mqtt incoming ]
        │
        ▼
controllers/devices.controller   ◄── zod validate (middleware/validate)
        │
        ▼
services/devices.ts              ◄── business logic + Mongoose write + DeviceLog write
        │   ├─ throw NotFoundError / ConflictError / StateError → errorHandler.ts → JSON error
        │   ├─ appBus.emitDeviceUpdated(doc)   หรือ   emitDeviceRemoved(id)
        │   └─ (ถ้า toggle) mqtt.publishCommand(id, isOn) fire-and-forget
        │
        ▼
services/events.ts (singleton EventEmitter)
        │
        ▼
controllers/events.controller    GET /api/events  (text/event-stream)
        │   ├─ retry: 3000  → EventSource auto-reconnect
        │   ├─ heartbeat ': ping' ทุก 25s
        │   └─ res.write('event: device_updated\ndata: <json>\n\n')
        │
        ▼
frontend/src/services/api.ts:subscribeToEvents
        └─ EventSource → onEvent → stores/devices.ts:upsertDevice / removeFromState
                                  / upsertUnclaimed / removeUnclaimed
```

**Event types ผ่าน SSE:** `device_updated`, `device_removed`, `pair_announced`, `pair_claimed`

**Emit point:** `services/devices.ts` (toggle/setMode/setAutoTimes/startOffTimer/cancelOffTimer/removeDevice/handleAck/handleCmdTimeout/handleHeartbeat/handleLwt/reconcileStaleHeartbeats) + `services/pairing.ts` (handleHello/claim) + `services/scheduler.ts:expireTimerIfDue`. ทุกจุดที่เขียน DB ต้อง emit ด้วย ไม่งั้น UI ไม่ sync

**Broadcast:** ทุก client ได้ event ทุกตัว ไม่มี filter ตาม device — ถ้า scale ค่อยเพิ่ม channel/room

### MQTT topology

Mosquitto broker ที่ port 1883 (+ 9001 ws debug). Backend เป็นทั้ง subscriber และ publisher

| Topic | Direction | QoS | Retained | Payload | จุดประสงค์ |
|-------|-----------|-----|----------|---------|-----------|
| `pair/hello` | ESP → backend | 1 | no | `{mac, model, fw}` | ESP ที่ยังไม่ pair publish ทุก 5s |
| `pair/ack/{mac}` | backend → ESP | 1 | **yes** | `{device_id}` | retained เพื่อให้ ESP รับ ack ได้แม้ claim ตอน ESP offline |
| `dev/{id}/cmd` | backend → ESP | 1 | no | `{cmd_id, action, isOn, ts}` | สั่ง toggle |
| `dev/{id}/ack` | ESP → backend | 1 | no | `{cmd_id, status, isOn}` | ตอบรับ cmd |
| `dev/{id}/hb` | ESP → backend | 0 | yes | `{isOn, rssi, uptime}` | heartbeat ทุก 30s |
| `dev/{id}/lwt` | broker → backend | 1 | yes | `"offline"` | broker auto-publish เมื่อ ESP TCP disconnect |

**Subscribe wildcards:** backend subscribe `pair/hello`, `dev/+/ack`, `dev/+/hb`, `dev/+/lwt` ใน `services/mqtt.ts:connect()`

**LWT (Last Will Testament):** ESP บอก broker ตอน connect ว่า "ถ้าฉันหายไปให้ publish `dev/{id}/lwt = offline` retained" → ได้ offline detection ฟรีโดยไม่ต้อง timer ฝั่ง backend

**Optimistic + async ACK:** `applyToggle()` update DB + emit SSE ทันทีหลัง `mqtt.publishCommand()` (ไม่รอ ack) — UI sync เร็ว. รายละเอียดดู §Toggle / command lifecycle ด้านล่าง

### Toggle / command lifecycle

```
┌──────┐         ┌─────────┐         ┌──────────┐         ┌─────┐
│  UI  │         │ Backend │         │ Mosquitto│         │ ESP │
└──┬───┘         └────┬────┘         └────┬─────┘         └──┬──┘
   │ POST /devices/{id}/toggle           │                  │
   ├────────────────►│ toggleDevice                          │
   │                 │ ├ guard: controlMode==='auto' → 409   │
   │                 │ ├ guard: !state.isOnline → 409 ★      │
   │                 │ └ applyToggle(nextOn, 'toggle')       │
   │                 │   ├ flip state.isOn + lastUpdatedAt   │
   │                 │   ├ writeLog 'toggle'                 │
   │                 │   ├ emit device_updated ──► SSE ──► UI flip ทันที (optimistic)
   │                 │   └ publishCommand fire-and-forget    │
   │                 │     ├ publish dev/{id}/cmd qos1       │
   │                 │     │ {cmd_id, action, isOn, ts} ────►│
   │                 │     └ setTimeout(ACK_TIMEOUT_MS=5s)   ├──► onMqttMessage(cmd)
   │                 │                                       │     setLight(isOn)
   │                 │                                       │◄──── publish dev/{id}/ack qos1
   │                 │                                       │      {cmdId, status, isOn}
   │                 │◄──────────────────────────────────────┤
   │                 │ handleAck                             │
   │                 │ ├ clear pending timer                 │
   │                 │ ├ ถ้า wasOffline → flip isOnline=true │
   │                 │ │   + log device_online               │
   │                 │ ├ ถ้า payload.isOn ≠ state.isOn       │
   │                 │ │   → sync DB + log hb_sync           │
   │                 │ ├ log cmd_ack                         │
   │                 │ └ emit device_updated                 │
   │                 │                                       │
   │                 │ === ทางเลือก: timer ครบไม่มี ack ===   │
   │                 │ handleCmdTimeout                      │
   │                 │ ├ log cmd_timeout                     │
   │                 │ └ ถ้า state.isOnline=true             │
   │                 │   → flip false                        │
   │                 │   → log device_offline (reason)       │
   │                 │   → emit device_updated ──► UI offline ภายใน ~5s
```

**Key invariants:**

1. Backend optimistic: DB เปลี่ยน + UI sync **ก่อน** publish — ไม่รอ ack
2. Drift reconcile หลายชั้น:
   - Ack มา → `handleAck` sync `state.isOn` จาก `payload.isOn` ถ้าต่าง
   - Ack ไม่มาใน 5s → mark offline (cmd_timeout)
   - Heartbeat ถัดไป → `hb_sync` ทำซ้ำการ sync เมื่อ device กลับมา
3. ไม่ rollback `state.isOn` เมื่อ cmd_timeout — เก็บเจตนา user ไว้; ถ้า hardware จริงต่างจาก DB, heartbeat ครั้งต่อไป (≤30s หลัง online กลับมา) จะแก้ผ่าน `hb_sync`
4. Late ack (>5s แต่ device จริงๆ ยังอยู่) → false-positive offline ชั่วคราว แต่ `handleAck` flip กลับ online ทันทีที่ ack มาถึง

### Offline detection — 3 paths

Backend ตัดสินใจว่า device หลุดจาก 3 จุด เรียงตามความเร็ว:

```
ESP ดับ/หลุด
   │
   ├── path A: ผู้ใช้กด toggle ขณะ device หลุด (~5s)
   │      └─► applyToggle → publishCommand → ไม่มี ack ใน ACK_TIMEOUT_MS
   │          └─► handleCmdTimeout → flip isOnline=false
   │              log device_offline (reason: cmd_timeout)
   │
   ├── path B: broker detect TCP disconnect (~60-90s)
   │      └─► broker auto-publish retained dev/{id}/lwt = "offline"
   │          └─► handleLwt → flip isOnline=false
   │              log device_offline
   │
   └── path C: tick reconcile (~90-120s, fallback)
          └─► runTick ทุก 30s → reconcileStaleHeartbeats(HEARTBEAT_GRACE_MS)
              query devices ที่ isOnline=true และ lastSeenAt < now-grace
              └─► handleLwt(id) → flip + log + emit
              (กันเคส broker รีสตาร์ทแล้ว LWT message หาย)
```

**กลับมา online** มี 2 path:
- Heartbeat ถัดไป → `handleHeartbeat` flip `isOnline=true` + log `device_online`
- Ack ของ cmd ที่ส่งไปขณะ DB ว่า offline → `handleAck` flip + log `device_online (reason: cmd_ack_after_offline)`

### Heartbeat / drift reconciliation

ESP publish `dev/{id}/hb` retained ทุก 30s — backend ใช้เป็นทั้ง liveness signal และ source of truth สำหรับ `isOn`

```
ESP loop ทุก 30s:
   publishHeartbeat → dev/{id}/hb retained {isOn, rssi, uptime}
         │
         ▼
   handleHeartbeat(deviceId, payload):
      doc = Device.findById(deviceId)
      if !doc → drop (firmware ค้าง id เก่าที่ถูกลบ)
      doc.state.isOnline = true
      doc.state.lastSeenAt = now
      ── drift check ──
      if payload.isOn !== state.isOn:
          state.isOn = payload.isOn
          state.lastUpdatedAt = now
          drifted = true
      save()
      if !wasOnline → writeLog 'device_online'
      if drifted    → writeLog 'hb_sync'
      emit device_updated
```

**Why retain heartbeat:** ถ้า backend boot ใหม่หลัง crash, retained `hb` ของแต่ละ device จะถูก deliver ทันทีที่ backend subscribe → backend reconstruct `isOnline` state ได้เร็วโดยไม่ต้องรอรอบหน้า

**Why hb_sync:** ปิด loop drift ระหว่าง backend optimistic state กับ hardware จริง. เคสที่จะเกิด:
- cmd หายใน MQTT (broker bug, QoS mismatch) — backend คิดว่า on, hardware off → heartbeat ถัดไปแก้
- ESP รีบูตเอง (watchdog) ระหว่าง cmd พอดี — state หลังรีบูตอาจไม่ตรงกับ backend → heartbeat แรกหลัง boot แก้

### Pairing flow (Announce & Claim)

User ไม่ต้องคิด device id เอง — ESP boot แล้วประกาศ MAC, user คลิก "Claim" ใน UI ใส่ location → backend gen id อัตโนมัติจาก MAC tail (`light-<6chars hex>`)

```
┌─────────┐         ┌──────────┐         ┌─────────┐         ┌──────────┐         ┌────┐
│   ESP   │         │ Mosquitto│         │ Backend │         │  Mongo   │         │ UI │
└────┬────┘         └────┬─────┘         └────┬────┘         └────┬─────┘         └─┬──┘
     │ boot → /id.txt ว่าง = pairing mode    │                   │                  │
     │ subscribe pair/ack/{mac}              │                   │                  │
     │ pub pair/hello {mac,model,fw} ทุก 5s   │                   │                  │
     ├──────────────────►├───────────────────►│                   │                  │
     │                   │                    │ pairing.handleHello                  │
     │                   │                    │ upsert PairingSession{mac,           │
     │                   │                    │   proposedId=light-<last6(mac)>,     │
     │                   │                    │   lastSeenAt:now}                    │
     │                   │                    ├──────────────────►│                  │
     │                   │                    │ emitPairAnnounced ─────────────────►│
     │                   │                    │                   │ tab "Pairing"    │
     │                   │                    │                   │ + pulse badge    │
     │                   │                    │                   │                  │
     │                   │                    │ POST /pairing/claim {mac, location} │
     │                   │                    │◄──────────────────────────────────────┤
     │                   │                    │ pairing.claim()   │                  │
     │                   │                    │ ├ Device.create   │                  │
     │                   │                    │ │  ({_id:light-xx,                   │
     │                   │                    │ │   location,     │                  │
     │                   │                    │ │   state.mac})   │                  │
     │                   │                    │ ├ delete PairingSession              │
     │                   │                    │ ├ log "paired"    │                  │
     │                   │                    │ ├ emit device_updated                │
     │                   │                    │ ├ emit pair_claimed(mac) ──────────►│ ลบ card
     │                   │                    │ └ publishPairAck  │                  │
     │                   │                    │   pair/ack/{mac}  │                  │
     │                   │                    │   {device_id}     │                  │
     │                   │                    │   retained=true ★ │                  │
     │                   │ relay              │                   │                  │
     │◄──────────────────┤                    │                   │                  │
     │ {device_id}       │                    │                   │                  │
     │ saveLittleFS(/id.txt) → ESP.restart()  │                   │                  │
     │                   │                    │                   │                  │
     │ === boot รอบที่ 2 — paired mode ===                         │                  │
     │ subscribe dev/{id}/cmd                 │                   │                  │
     │ pub dev/{id}/hb retained               │                   │                  │
     │ LWT dev/{id}/lwt="offline" retained    │                   │                  │
```

**Key invariants:**

1. `pair/hello` ทุก 5s — idempotent, backend upsert by mac
2. `pair/ack/{mac}` **retained=true** — ถ้า user claim ตอน ESP offline → ESP กลับมา subscribe ปุ๊บ ได้ ack ทันที
3. `proposedId = 'light-' + macLast6.toLowerCase()` — deterministic, user ไม่ต้องตั้งชื่อ
4. `pairing.handleHello` idempotent re-pair — ถ้า MAC นี้มี Device แล้ว (เช่น ESP erase flash แล้ว pair ใหม่) → re-publish ack ของ device id เดิม ไม่สร้าง device ใหม่
5. PairingSession มี TTL index 3600s บน `lastSeenAt` → ESP ที่หายไป auto-cleanup ฝั่ง DB
6. **Clear-on-delete:** `removeDevice` clear retained `pair/ack/{mac}` + `dev/{id}/lwt` + `dev/{id}/hb` ออกจาก broker (publish empty payload retain=true) — กันเคส ESP erase flash + re-pair แล้วได้ `device_id` เก่าที่ถูกลบมา save
7. **UI stale handling** (client-side, ไม่พึ่ง TTL):
   - `lastSeenAt > 30s` ago → card fade + badge "ไม่ตอบสนอง"
   - `lastSeenAt > 5min` ago → ซ่อนจาก UI (store filter ออก)

### Remove device flow

ลบ device ที่ paired แล้วต้องเคลียร์ retained messages ใน broker ด้วย ไม่งั้น ESP ที่ erase flash แล้ว re-pair จะได้ ack เก่ากลับมา

```
DELETE /api/devices/{id}
        │
        ▼
services/devices.ts:removeDevice
   ├ findById → ดึง mac ก่อน
   ├ Device.deleteOne
   ├ DeviceLog.deleteMany ({ deviceId }) — collection หลัก (archived ไม่ลบ)
   ├ emit device_removed → SSE → UI หาย card
   ├ mqtt.clearPairAck(mac)                   pub pair/ack/{mac}  ''  retain
   └ mqtt.clearDeviceLwt(id)                  pub dev/{id}/lwt    ''  retain
                                              pub dev/{id}/hb     ''  retain
```

**Why clear 3 topics:**
- `pair/ack/{mac}` — กัน ESP ที่ erase flash แล้ว subscribe กลับมาเจอ ack เก่าของ device id ที่ถูกลบ
- `dev/{id}/lwt` — เคลียร์ marker "offline" ไม่ให้ broker เก็บไว้
- `dev/{id}/hb` — เคลียร์ retained heartbeat (กรณี id ถูกใช้ซ้ำในอนาคต)

ESP ที่ยังเก็บ id เก่าใน LittleFS แล้วยัง publish heartbeat → backend `handleHeartbeat` เจอ `if (!doc) return` → drop เงียบๆ. ESP เคยรู้สึก disconnect ต้อง erase flash เอง (ไม่มี remote wipe)

### Scheduled jobs (`node-cron`)

- `tickJob` — `*/30 * * * * *` รัน `runTick()` ที่ `services/scheduler.ts`. ขั้นตอน:
  1. `reconcileStaleHeartbeats(HEARTBEAT_GRACE_MS)` — query device ที่ `isOnline=true` แต่ `lastSeenAt < now - grace` → เรียก `handleLwt` (offline detection path C — fallback)
  2. Query candidate (mode=auto หรือมี offTimerEndsAt) → คำนวณ desired state ผ่าน `lib/time.ts` → call `applyToggle()` ผ่าน `applyAutoScheduleIfNeeded` (skip ถ้า device offline) → log + emit
  3. `expireTimerIfDue` — ถ้า device offline ตอน timer ครบ จะ clear `offTimerEndsAt` ตรงๆ (ไม่ publish cmd)
- `archiveJob` — `0 3 * * *` (03:00 ทุกวัน) batch 1000 ย้าย `device_logs` ที่เก่ากว่า 30 วัน → `device_logs_archived` (ไม่ใช่ TTL — เก็บไว้). Manual: `POST /api/admin/archive-logs` พร้อม header `X-Admin-Key`

### Database

`devices` (1 doc / 1 device, state ฝังใน document):
- `_id: string` — case-insensitive uniqueness ตรวจที่ `services/devices.ts:findOne().collation()` preflight (MongoDB ไม่ยอม custom index บน `_id` — อย่าพยายามเพิ่ม index นี้)
- `state: { isOn, lastUpdatedAt, controlMode, autoOnTime, autoOffTime, offTimerEndsAt, isOnline, lastSeenAt, mac }`
- index: `state.mac` sparse (สำหรับ lookup ตอน re-pair)

`pairing_sessions` (unclaimed ESP):
- `mac` unique, `proposedId`, `model`, `fw`, `firstSeenAt`, `lastSeenAt`
- **TTL index 3600s บน lastSeenAt** — auto-cleanup ถ้า ESP หายไป

`device_logs` — append-only log ของ state change. `type` enum:
- state change: `toggle | mode_change | timer_set | timer_cancel | auto_on | auto_off | timer_expired`
- mqtt lifecycle: `cmd_ack | cmd_timeout | device_online | device_offline | hb_sync | paired`

`hb_sync` = ติด tag เมื่อ heartbeat รายงาน `isOn` ต่างจาก DB → backend sync ตาม hardware. ดู §Heartbeat / drift reconciliation

ไม่ log การเปลี่ยน auto_times (ถือเป็น config)

`device_logs_archived` — schema เดียวกัน collection แยก archive job ใช้ insertMany (ordered:false) + deleteMany ไม่ใช้ transaction (idempotent อยู่แล้ว)

Cascade delete: ลบ device → ลบ logs ของ device นั้นใน collection เดียวกัน (archived ไม่ลบ)

### Validation

- Boundary: zod ที่ `schemas/device.zod.ts` + `schemas/pairing.zod.ts` ผ่าน `middleware/validate.ts` — error message เป็นภาษาไทย
- Defense in depth: Mongoose validators (regex `MAC_PATTERN`, maxlength, enum)
- ไม่มีหน้า manual register แล้ว — pairing เป็นทางเข้าเดียวของ device ใหม่

### Error shape

`{ error: { code, message, fields? } }` — `errorHandler.ts` map ZodError → 400, Mongoose ValidationError → 400, duplicate key 11000 → 409, NotFoundError → 404, ConflictError → 409, StateError → 409, อื่น → 500 + pino log

## Env

`application/backend/.env` (gitignored — มี `.env.example` ติดมา):
- core: `PORT`, `MONGODB_URI`, `FRONTEND_URL`, `ADMIN_KEY`, `LOG_LEVEL`
- mqtt: `MQTT_URL` (default `mqtt://localhost:1883`), `MQTT_USERNAME?`, `MQTT_PASSWORD?`, `ACK_TIMEOUT_MS` (default 5000), `HEARTBEAT_GRACE_MS` (default 90000)

Boot `config/env.ts` validate ผ่าน zod fail-fast

`application/frontend/.env.development`: `VITE_API_URL=http://localhost:3000`

`microcontroller/automate_nodemcu_light/src/secrets.h` (gitignored — มี `secrets.h.example`):
- `MQTT_HOST`, `MQTT_PORT` — backend IP บน LAN
- optional `WIFI_SSID`, `WIFI_PASSWORD` — ถ้าไม่ define จะ fall back ไป WiFiManager captive portal (AP `light-setup-XXXX`)

## Conventions

- Backend `import` ใช้ `.ts` extension ทั้งโครงการ (tsx + `allowImportingTsExtensions`)
- Server logs (pino) แยกจาก device logs ใน DB — อย่าปนกัน. pino-http `autoLogging: false` เพื่อเลี่ยง spam "request completed"
- ไม่มี optimistic update ใน frontend สำหรับ state change — backend คืน Device document เต็มทุก action เสมอ → store แค่ replace entry
- MQTT cmd เป็น optimistic + async ack — UI sync ทันทีจาก SSE หลังจาก backend write DB; ack มี side-effect เพิ่ม (flip isOnline เมื่อกลับมา, sync isOn ถ้า drift, log cmd_ack), cmd_timeout flip isOnline=false
- Thai error messages มาจาก backend; frontend แสดงตรงๆ ไม่แปล
- Branch policy: ทำบน `feat/*` แล้ว PR เข้า `master` ไม่ commit ตรง
- ESP ต้องอยู่ subnet เดียวกับ backend (MQTT broker) — ESP บน WiFi อื่น เช่น hotspot มือถือ จะต่อ broker บน LAN ไม่ได้
