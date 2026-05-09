# sensor-registry

ระบบควบคุมหลอดไฟ (สถานะปัจจุบัน: simulation — ยังไม่เชื่อมกับ hardware จริง)

```
sensor-registy/
├── application/
│   ├── frontend/        Vue 3 + Vite + Pinia (TypeScript)
│   └── backend/         Express + Mongoose + MongoDB (TypeScript)
├── microcontroller/     placeholder สำหรับ firmware ภายหลัง (ESP/Arduino)
├── docker-compose.yml   MongoDB 7 สำหรับ dev
└── ...
```

## เริ่มต้นใช้งาน

ต้องมี: Node.js 22+, npm, Docker (สำหรับ MongoDB)

```sh
# 1. เริ่ม MongoDB
docker compose up -d

# 2. backend (terminal ที่ 1)
cd application/backend
cp .env.example .env
npm install
npm run dev
# → http://localhost:3000

# 3. frontend (terminal ที่ 2)
cd application/frontend
npm install
npm run dev
# → http://localhost:5173
```

หน้าเว็บเปิดที่ `http://localhost:5173` — สมัคร device ใหม่ได้ที่ `/register`

## โครงการย่อย

- [`application/frontend/`](./application/frontend) — UI: register / list / control / history
- [`application/backend/`](./application/backend) — REST API + SSE live updates + log archive job
- [`microcontroller/`](./microcontroller) — firmware (ยังว่างอยู่)
