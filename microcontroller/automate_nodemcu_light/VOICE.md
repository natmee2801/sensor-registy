# Voice control — VC-02-Kit + NodeMCU

ESP8266 รับคำสั่งเสียงผ่านโมดูล **VC-02-Kit ("Pudding" — AI-Thinker)** ทาง UART แล้ว flip output + publish heartbeat ทันทีไป backend (sync ผ่าน `hb_sync` path เดิม ไม่ต้องแก้ backend)

## 1. Wiring

```
   ┌────────────────┐                ┌─────────────────────┐
   │  VC-02-Kit     │                │  NodeMCU (ESP8266)  │
   │  (Pudding)     │                │                     │
   │                │                │                     │
   │  VCC  ─────────┼────────────────┤  3V3                │
   │  GND  ─────────┼────────────────┤  GND                │
   │  TX   ─────────┼──── (data) ───►│  D7 (GPIO13) = RX   │
   │  RX   ◄────────┼──── (data) ────┤  D5 (GPIO14) = TX   │
   │                │                │                     │
   │  speaker out ──┼─► [ลำโพง]      │  LED_BUILTIN = out1 │
   │  mic in ◄──────┼─── [mic]       │  D2 (GPIO4)  = out2 │
   └────────────────┘                └─────────────────────┘
```

**Cross-wire reminder:** TX ↔ RX (ห้าม TX↔TX, RX↔RX)

**UART params:** 115200 8N1, ESP ใช้ `SoftwareSerial` เพราะ hardware Serial ใช้ debug 115200 อยู่
**Outputs:**
- `out1` = LED_BUILTIN (active-LOW) = "cold light" (ดวงที่ 1)
- `out2` = D2/GPIO4 (active-HIGH) = "warm light" (ดวงที่ 2)

## 2. Voice command reference

VC-02 ส่ง packet 5 bytes: `[0x5a, cmd, 0x00, 0x00, checksum]` — checksum = `(0x5a + cmd) & 0xff`

### Wake commands

| Voice | Code | Packet (hex) | ผล |
|---|---|---|---|
| `hey pudding` / `hello pudding` | 0x00 | `5a 00 00 00 5a` | เข้า LISTENING (10s window) |
| `goodbye` / `see you` | 0x01 | `5a 01 00 00 5b` | ออกทันที → IDLE |

### Light control (ต้องอยู่ใน LISTENING)

| Voice | Code | Packet | out1 (cold) | out2 (warm) |
|---|---|---|---|---|
| `turn on the light` | 0x27 | `5a 27 00 00 81` | **ON** | — |
| `turn off the light` | 0x28 | `5a 28 00 00 82` | **OFF** | **OFF** |
| `cold light turn on` | 0x29 | `5a 29 00 00 83` | **ON** | — |
| `cold light turn off` | 0x2a | `5a 2a 00 00 84` | **OFF** | — |
| `warm light turn on` | 0x2b | `5a 2b 00 00 85` | **ON** | **ON** |
| `warm light turn off` | 0x2c | `5a 2c 00 00 86` | — | **OFF** |

"—" = ไม่แตะ output นั้น (state เดิมคงไว้)

**สรุปกลุ่ม:**
- **เปิดดวงเดียว (cold):** `turn on the light`, `cold light turn on`
- **เปิดทั้ง 2:** `warm light turn on`
- **ปิดดวงเดียว (cold):** `cold light turn off`
- **ปิดดวงเดียว (warm):** `warm light turn off`
- **ปิดทั้งหมด:** `turn off the light`

## 3. State machine

```
                                  ┌────────────────────────┐
                                  │                        │
              wake (0x00)         │     LISTENING          │
       ┌────────────────────────► │  (รับคำสั่ง control)   │
       │                          │  start = millis()      │
       │                          └────────────┬───────────┘
       │                                       │
   ┌───┴────┐                                  │ valid cmd
   │  IDLE  │                                  │ → start = millis()
   │        │                                  │   (refresh window)
   │        │                                  ▼
   └───▲────┘                          ┌───────────────┐
       │                               │ apply output  │
       │ exit (0x01)                   │ + publish hb  │
       │ OR > 10s inactivity           └───────┬───────┘
       │                                       │
       └───────────────────────────────────────┘
```

**Key invariants:**
1. **Refresh on every valid cmd** — `listeningStartMs = millis()` ทุกครั้งที่รับ wake หรือ control → user chain คำสั่งได้ตราบที่แต่ละคำห่างกัน <10s
2. **Idempotent** — `applyLight()` ตรวจ `lightOn[idx] == desiredOn` คืน false ถ้าไม่เปลี่ยน → ไม่ publish hb ซ้ำ
3. **Single hb per voice command** — แม้ WARM_ON flip 2 outputs ก็ publish heartbeat ครั้งเดียว (payload มี outputs ครบ 2 ฝั่ง)
4. **Control นอก LISTENING → ignored** — VC-02 อาจส่งคำสั่งมาตอน user ลืมพูด wake; ESP log แล้วทิ้ง

## 4. End-to-end flow

```
┌────┐         ┌────────┐        ┌──────┐       ┌─────────┐       ┌────┐
│User│         │ VC-02  │        │ ESP  │       │ Backend │       │ UI │
└─┬──┘         └───┬────┘        └──┬───┘       └────┬────┘       └──┬─┘
  │ "hey pudding"  │                │                │                │
  ├───────────────►│ recognize      │                │                │
  │                │ speak "Hi"     │                │                │
  │                │ TX 5a 00 00 00 5a ─────────────►│                │
  │                │                │ state=LISTENING│                │
  │                │                │                │                │
  │ "turn on the light"            │                │                │
  ├───────────────►│ recognize      │                │                │
  │                │ speak "ok"     │                │                │
  │                │ TX 5a 27 00 00 81 ─────────────►│                │
  │                │                │ applyLight(0,true)              │
  │                │                │ setLight → out1 HIGH            │
  │                │                │ publishHeartbeat   │            │
  │                │                ├──── MQTT hb ──────►│            │
  │                │                │ refresh window     │ handleHeartbeat
  │                │                │                    │ ├ drift: out1 isOn=true
  │                │                │                    │ ├ writeLog hb_sync
  │                │                │                    │ └ emit device_updated
  │                │                │                    ├─── SSE ──►│
  │                │                │                    │           │ card flip
  │                │                │                    │           │ (<1s)
```

## 5. Troubleshooting

เปิด `pio device monitor` (115200 baud) เห็น log:

| Log | ความหมาย | แก้ |
|---|---|---|
| `[vc02] cmd=0xXX state=LISTENING` | รับ packet ปกติ ตอน listening | — |
| `[vc02] cmd=0xXX state=IDLE` | รับ packet แต่ยังไม่ wake | พูด "hey pudding" ก่อน |
| `[vc02] ignored cmd=0xXX — listening window expired` | window หมด 10s | refresh ทำงาน — คำสั่งถัดไปต้อง wake |
| `[vc02] ignored cmd=0xXX — not in listening mode` | state=IDLE | wake ก่อน |
| `[vc02] checksum fail ...` | UART corrupt (SW serial drop bytes) | ลด baud หรือเปลี่ยนไป hardware `Serial.swap()` |
| `[voice] applied output=outN isOn=X` | flip สำเร็จ + จะ publish hb | — |
| ไม่มี `[vc02]` log เลย | ESP ไม่ได้รับ UART | เช็ค wiring TX↔RX, GND ร่วม |

### อาการ "VC-02 ทวนคำสั่งถูกแต่ไฟไม่ทำงาน"

VC-02 พูด response = รู้จักคำสั่งแล้ว + ส่ง UART ออก. ถ้าไฟไม่ flip:
1. ดู serial — packet มาถึง ESP ไหม
2. ถ้าเห็น `ignored — window expired` → window สั้นไป (default 10s) → เพิ่ม `LISTENING_TIMEOUT_MS` ใน `main.cpp`
3. ถ้าเห็น `state=IDLE` → VC-02 module เองอาจกลับ standby ระหว่างคำสั่ง — ต้องพูด "hey pudding" ก่อนทุกคำสั่ง

### อาการ "คำสั่งแรกทำงาน คำสั่งถัดไปเงียบ"

- Firmware ตั้งแต่ commit `847cb1e` แก้แล้ว — refresh window ทุก valid cmd
- ถ้ายังเป็น: VC-02 internal state ของโมดูลกลับ idle ระหว่างคำสั่ง — ต้อง re-flash voice model VC-02 ด้วย SkyAIoT IDE ให้รองรับ "continuous listening"

## 6. ไฟล์ที่เกี่ยวข้อง

| File | Path | บทบาท |
|---|---|---|
| Firmware | `microcontroller/automate_nodemcu_light/src/main.cpp` | parser + state machine + apply |
| Backend handler | `application/backend/src/services/devices.ts` `handleHeartbeat` | รับ hb → log `hb_sync` → emit SSE |
| Vendor datasheet | `microcontroller/vc_factorycommandtable.pdf` | command code reference |
| MQTT topology | `CLAUDE.md` §MQTT topology | topic ที่เกี่ยวข้อง |
