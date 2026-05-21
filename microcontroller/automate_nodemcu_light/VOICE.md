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
| `hey pudding` / `hello pudding` | 0x00 | `5a 00 00 00 5a` | informational — VC-02 รายงานว่าเข้า wake state, ESP แค่ log |
| `goodbye` / `see you` | 0x01 | `5a 01 00 00 5b` | informational — VC-02 รายงานว่าออก wake state |

VC-02 gating wake window เองภายใน module — ESP ไม่ track state. ถ้า packet มาถึง ESP แสดงว่า module ฟังอยู่ apply ตรงๆ ดู §3

### Light control

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

## 3. State model — stateless, ฝั่ง ESP

ESP **ไม่** track wake state เอง — เชื่อว่า VC-02 gate wake window ภายใน module ครบแล้ว (LED React + timeout ของ voice model). ถ้า packet มาถึง ESP แสดงว่า module ฟังอยู่ → apply ตรงๆ

```
   VC-02 internal                  ESP
   ─────────────                   ─────────────
   พูด wake word ─────────────────► รับ 0x00 → log อย่างเดียว
   user พูดคำสั่ง                  
   recognize + speak response       
   send packet ผ่าน UART ──────────► รับ → apply → publishHeartbeat
   wake window หมด (internal)       
   ไม่ส่ง packet อีก               ─── (ESP ก็เงียบตาม ไม่ต้อง track)
```

**ทำไม:**
- VC-02 spec (`vc-02-kit_specification_v1.0.0_516.pdf` §4) ระบุ React LED on/off เป็น wake/standby indicator — module gate เองอยู่แล้ว
- ESP ไม่มีทางเช็ค LED React จาก pin header (ดู §7) จึง track state ซ้ำไม่ได้แม่นยำ
- 2 timer ใน ESP กับใน module ที่ไม่ sync = edge case แปลกๆ — เลิกได้เลิก

**Key invariants:**
1. **Idempotent** — `applyLight()` ตรวจ `lightOn[idx] == desiredOn` คืน false ถ้าไม่เปลี่ยน → ไม่ publish hb ซ้ำ
2. **Single hb per voice command** — แม้ WARM_ON flip 2 outputs ก็ publish heartbeat ครั้งเดียว (payload มี outputs ครบ 2 ฝั่ง)
3. **Wake/Exit packets** — รับมาเป็น informational log เท่านั้น ไม่ trigger state ใน ESP

## 4. End-to-end flow

```
┌────┐         ┌────────┐        ┌──────┐       ┌─────────┐       ┌────┐
│User│         │ VC-02  │        │ ESP  │       │ Backend │       │ UI │
└─┬──┘         └───┬────┘        └──┬───┘       └────┬────┘       └──┬─┘
  │ "hey pudding"  │                │                │                │
  ├───────────────►│ recognize      │                │                │
  │                │ React LED on   │                │                │
  │                │ speak "Hi"     │                │                │
  │                │ TX 5a 00 00 00 5a ─────────────►│                │
  │                │                │ log only       │                │
  │                │                │                │                │
  │ "turn on the light"            │                │                │
  ├───────────────►│ recognize      │                │                │
  │                │ speak "ok"     │                │                │
  │                │ TX 5a 27 00 00 81 ─────────────►│                │
  │                │                │ applyLight(0,true)              │
  │                │                │ setLight → out1 HIGH            │
  │                │                │ publishHeartbeat                │
  │                │                ├──── MQTT hb ──────►│            │
  │                │                │                    │ handleHeartbeat
  │                │                │                    │ ├ drift: out1 isOn=true
  │                │                │                    │ ├ writeLog hb_sync
  │                │                │                    │ └ emit device_updated
  │                │                │                    ├─── SSE ──►│
  │                │                │                    │           │ card flip
  │                │                │                    │           │ (<1s)
  │                │                │                │                │
  │ ... (เงียบเกิน wake window) ... │                │                │
  │                │ React LED off  │                │                │
  │                │ standby — ไม่ส่ง packet อีก                      │
  │                │                │                │                │
  │ "turn off"     │ ไม่ recognize  │                │                │
  ├───────────────►│ (ต้อง wake ใหม่)                                  │
  │                │                │                │                │
  │ "hey pudding"  │                │                │                │
  ├───────────────►│ recognize → … (loop)                              │
```

**สรุป:** ESP เป็น passive responder ของ VC-02 — ไม่มี state ภายใน. ทุก wake window จัดการที่ module เอง

## 5. Troubleshooting

เปิด `pio device monitor` (115200 baud) เห็น log:

| Log | ความหมาย | แก้ |
|---|---|---|
| `[vc02] cmd=0xXX` | รับ packet ปกติ | ตามด้วย `[voice] applied …` ถ้าเป็น control cmd |
| `[vc02] unknown cmd=0xXX` | code ที่ไม่ map (เช่น AC commands) | ไม่ใช่ปัญหา — voice model มี 150 คำ ใช้เฉพาะ light 6 ตัว |
| `[vc02] checksum fail ...` | UART corrupt (SW serial drop bytes) | ลด baud หรือเปลี่ยนไป hardware `Serial.swap()` (RX/TX ที่ alt pins D7/D8) |
| `[voice] applied output=outN isOn=X` | flip สำเร็จ + จะ publish hb | — |
| ไม่มี `[vc02]` log เลย | ESP ไม่ได้รับ UART | เช็ค wiring TX↔RX, GND ร่วม |

### อาการ "VC-02 ทวนคำสั่งถูกแต่ไฟไม่ทำงาน"

VC-02 พูด response = รู้จักคำสั่ง + ส่ง UART ออกแล้ว. ถ้าไฟไม่ flip:
1. ดู serial — packet มาถึง ESP ไหม
2. ถ้าไม่เห็น `[vc02] cmd=...` → wiring TX/RX สลับ หรือ GND ไม่ common
3. ถ้าเห็น `[vc02] cmd=0xXX` แต่ไม่ตามด้วย `[voice] applied` → state ของ output (`lightOn[]`) ตรงกับที่ขอแล้ว (idempotent skip) — กดผ่าน UI สลับก่อนแล้วลองใหม่

### อาการ "คำสั่งแรกทำงาน คำสั่งถัดไปเงียบ"

VC-02 internal wake window หมด — module กลับ standby (React LED ดับ) ไม่ส่ง packet แล้ว
- **แก้:** พูด `hey pudding` ก่อนทุกคำสั่งใหม่
- **หรือ:** re-flash voice model VC-02 ด้วย SkyAIoT IDE ให้ window ยาวขึ้น/continuous listening

### Ack-late จาก voice update

ESP publish hb ทันทีหลัง flip → backend `handleHeartbeat` `hb_sync` log + emit SSE. ไม่มี `cmd_ack` log เพราะ voice action ไม่ originate จาก `dev/{id}/cmd` ที่มี `cmd_id`

## 6. ไฟล์ที่เกี่ยวข้อง

| File | Path | บทบาท |
|---|---|---|
| Firmware | `microcontroller/automate_nodemcu_light/src/main.cpp` | UART parser + apply |
| Backend handler | `application/backend/src/services/devices.ts` `handleHeartbeat` | รับ hb → log `hb_sync` → emit SSE |
| VC-02 command list | `microcontroller/vc_factorycommandtable.pdf` | factory voice model — 150 คำสั่ง (เราใช้ 8 ตัว) |
| VC-02 hardware spec | `microcontroller/vc-02-kit_specification_v1.0.0_516.pdf` | pin definition + electrical + LED indicator |
| MQTT topology | `CLAUDE.md` §MQTT topology | topic ที่เกี่ยวข้อง |

## 7. ทำไม React LED ของ VC-02 ไม่ track ผ่าน ESP ได้

`vc-02-kit_specification_v1.0.0_516.pdf` §5 (pin definition) ระบุ 19 pin — มี TX1/RX1 (UART), I2C, GPIO, JTAG แต่ **ไม่มี pin output สำหรับ React/Warm/Cool LED status**

LED ทั้ง 3 ดวงถูกขับโดย internal GPIO ของ chip US516P6 — driven จากใน module factory firmware เอง ไม่ expose มาที่ DIP header. ถ้าอยาก track wake state ทำได้ทาง:

1. **Hardware mod**: solder ลง test point ของ React LED แล้วต่อสายไป ESP GPIO (ทำลาย warranty)
2. **อ่าน debug log ผ่าน IOB8** (pin 14, UART0 @ 57600 baud) — ไม่ document format ของ factory firmware
3. **Re-flash voice model** กับ SkyAIoT IDE → กำหนด custom UART output ตอน enter/exit wake state เอง

ทั้ง 3 ทางเกินขอบเขต project — เลือก stateless ESP ดีกว่า
