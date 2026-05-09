# sensor-registry

ระบบควบคุมหลอดไฟแบบ simulation — ไม่ได้คุย Arduino/ESP จริง การ toggle/auto/timer เป็น state จำลองทั้งหมด เก็บใน MongoDB. โฟลเดอร์ `microcontroller/` เผื่อ firmware ภายหลัง

**Stack:** Vue 3 (beta) + Pinia + Vite 8 (frontend) · Express 5 + Mongoose 8 + zod (backend) · MongoDB 7 (Docker) · TypeScript ทั้งสองฝั่ง

## Layout

```
application/
├── frontend/          Vue SPA — http://localhost:5173
└── backend/           REST + SSE — http://localhost:3000
microcontroller/       placeholder
docker-compose.yml     Mongo 7 only
```

ไม่ใช้ npm workspaces — ติดตั้ง/รันแยกต่อ project

## Dev commands

```sh
docker compose up -d                            # MongoDB
npm --prefix application/backend run dev        # tsx watch src/server.ts
npm --prefix application/frontend run dev       # vite
npm --prefix application/backend run type-check # tsc --noEmit
npm --prefix application/frontend run type-check # vue-tsc --build
```

Backend ใช้ `tsx` ตรงๆ ไม่มี build step — import path ใน backend/src/ ใช้ `.ts` extension เสมอ (เช่น `from './events.ts'`)

## Architecture

### Event flow (state changes)

Backend เป็น single source of truth. ทุก state mutation วิ่งผ่าน path เดียว แล้ว push ไปทุก client ที่ connect ผ่าน SSE — frontend ไม่ poll

```
[ user click / cron tick ]
        │
        ▼
controllers/devices.controller   ◄── zod validate (middleware/validate)
        │
        ▼
services/devices.ts              ◄── business logic + Mongoose write + DeviceLog write
        │   ├─ throw NotFoundError / ConflictError / StateError → errorHandler.ts → JSON error
        │   └─ appBus.emitDeviceUpdated(doc)   หรือ   emitDeviceRemoved(id)
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
```

**Emit point:** `services/devices.ts` register/delete/toggle/setMode/setAutoTimes/startOffTimer/cancelOffTimer + `services/scheduler.ts:expireTimerIfDue`. ทุกจุดที่เขียน DB ต้อง emit ด้วย ไม่งั้น UI ไม่ sync

**Broadcast:** ทุก client ได้ event ทุกตัว ไม่มี filter ตาม device — ถ้า scale ค่อยเพิ่ม channel/room

### Scheduled jobs (`node-cron`)

- `tickJob` — `*/30 * * * * *` รัน `runTick()` ที่ `services/scheduler.ts` query candidate (mode=auto หรือมี offTimerEndsAt) → คำนวณ desired state ผ่าน `lib/time.ts` → call `applyToggleInternal()` (path เดียวกับ user toggle) → log + emit
- `archiveJob` — `0 3 * * *` (03:00 ทุกวัน) batch 1000 ย้าย `device_logs` ที่เก่ากว่า 30 วัน → `device_logs_archived` (ไม่ใช่ TTL — เก็บไว้). Manual: `POST /api/admin/archive-logs` พร้อม header `X-Admin-Key`

### Database

`devices` (1 doc / 1 device, state ฝังใน document):
- `_id: string` — case-insensitive uniqueness ตรวจที่ `services/devices.ts:findOne().collation()` preflight (MongoDB ไม่ยอม custom index บน `_id` — อย่าพยายามเพิ่ม index นี้)
- `state: { isOn, lastUpdatedAt, controlMode, autoOnTime, autoOffTime, offTimerEndsAt }`

`device_logs` — append-only log ของ state change. `type` enum: `toggle | mode_change | timer_set | timer_cancel | auto_on | auto_off | timer_expired`. ไม่ log การเปลี่ยน auto_times (ถือเป็น config)

`device_logs_archived` — schema เดียวกัน collection แยก archive job ใช้ insertMany (ordered:false) + deleteMany ไม่ใช้ transaction (idempotent อยู่แล้ว)

Cascade delete: ลบ device → ลบ logs ของ device นั้นใน collection เดียวกัน (archived ไม่ลบ)

### Validation

- Boundary: zod ที่ `schemas/device.zod.ts` ผ่าน `middleware/validate.ts` — error message เป็นภาษาไทย คัดมาจาก legacy frontend store
- Defense in depth: Mongoose validators (regex, maxlength, enum)
- Frontend `validateRegistration` เป็น preflight UX ไม่ใช่ source of truth — backend คืน 400 แล้ว store จะ merge errors

### Error shape

`{ error: { code, message, fields? } }` — `errorHandler.ts` map ZodError → 400, Mongoose ValidationError → 400, duplicate key 11000 → 409, NotFoundError → 404, ConflictError → 409, StateError → 409, อื่น → 500 + pino log

## Env

`application/backend/.env` (gitignored — มี `.env.example` ติดมา): `PORT`, `MONGODB_URI`, `FRONTEND_URL`, `ADMIN_KEY`, `LOG_LEVEL`. Boot `config/env.ts` validate ผ่าน zod fail-fast

`application/frontend/.env.development`: `VITE_API_URL=http://localhost:3000`

## Conventions

- Backend `import` ใช้ `.ts` extension ทั้งโครงการ (tsx + `allowImportingTsExtensions`)
- Server logs (pino) แยกจาก device logs ใน DB — อย่าปนกัน
- ไม่มี optimistic update ใน frontend — backend คืน Device document เต็มทุก action เสมอ → store แค่ replace entry
- Thai error messages มาจาก backend; frontend แสดงตรงๆ ไม่แปล
- Branch policy: ทำบน `feat/*` แล้ว PR เข้า `master` ไม่ commit ตรง
