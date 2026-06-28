# Wiring — NodeMCU v2 + 2-ch low-trigger relay module + VC-02 voice

Firmware นี้ขับ relay module 2 channel แบบ **low-trigger** (IN=LOW → coil energized → NO closed) ผ่าน GPIO ของ NodeMCU v2 (ESP8266) ดวงไฟ 2 ดวงต่อผ่าน COM/NO ของ relay แต่ละช่อง

## Pinout

| NodeMCU pin | GPIO | ทิศทาง | ใช้ทำอะไร | macro ใน `src/main.cpp` |
|-------------|------|--------|----------|--------------------------|
| **D1** | GPIO5  | OUT | → relay IN1 (ช่อง 1 = `out1` / cold) | `LIGHT_PIN_OUT1` |
| **D6** | GPIO12 | OUT | → relay IN2 (ช่อง 2 = `out2` / warm) | `LIGHT_PIN_OUT2` |
| **D5** | GPIO14 | OUT | → VC-02 RX (SoftwareSerial TX) | `VC02_TX_PIN` |
| **D7** | GPIO13 | IN  | ← VC-02 TX (SoftwareSerial RX) | `VC02_RX_PIN` |
| **Vin** | — | 5V out | → relay VCC + VC-02 VCC | — |
| **GND** | — | 0V | → relay GND + VC-02 GND | — |

ทั้ง OUT1 และ OUT2 เป็น **active-LOW** (`ACTIVE_LOW_OUT1=1`, `ACTIVE_LOW_OUT2=1`) — `setLight(idx, true)` จะ `digitalWrite(LOW)` ทำให้ relay ติด

**Pin ที่ตั้งใจปล่อยว่าง / หลีกเลี่ยง:**

| Pin | GPIO | เหตุผล |
|-----|------|--------|
| D0 | GPIO16 | no interrupt, HIGH at boot, no internal pull-up |
| D3 | GPIO0  | flash-mode select (ต้อง HIGH at boot) |
| D4 | GPIO2  | boot-strap (ต้อง HIGH at boot), shared LED |
| D8 | GPIO15 | ต้อง LOW at boot (มี pull-down) |
| D9/D10 | GPIO3/1 | hardware UART (Serial monitor 115200) |
| D2 | GPIO4  | ว่างใช้ได้ — ยังไม่ได้ใช้ในเวอร์ชันนี้ |

## Circuit diagram

```
                    NodeMCU v2 (ESP8266)
                ┌────────────────────────┐
                │                        │
            5V ─┤ Vin              D1 ───┼──────► IN1  ┐
                │                        │             │
           GND ─┤ GND              D6 ───┼──────► IN2  │  2-Channel
                │                        │             │  Relay Module
                │                  D5 ───┼─► VC-02 RX  │  (low-trigger)
                │                  D7 ◄──┼─  VC-02 TX  │
                │                        │             │
                │ D4 (LED) — ปล่อยว่าง    │      VCC ◄──┘  (จาก Vin 5V)
                │ D2      — ปล่อยว่าง     │      GND ◄──┐
                │ D0/D3/D8 หลีกเลี่ยง     │             │
                └────────────────────────┘             │
                                  └─ GND shared ───────┘

         ┌─── Relay Module (low-trigger, IN=LOW → ON) ───┐
         │                                                │
   VCC ──┤ VCC                                            │
   GND ──┤ GND                                            │
   D1  ──┤ IN1 ──► [opto] ──► [coil 1] ──► relay 1 ───┐  │
   D6  ──┤ IN2 ──► [opto] ──► [coil 2] ──► relay 2 ─┐ │  │
         │                                          │ │  │
         │   CH1:  NC1 ─── COM1 ─── NO1 ───────► ───┼─┼──┼── ดวงไฟ 1
         │   CH2:  NC2 ─── COM2 ─── NO2 ───────► ───┼─┘  │
         │                                          │    │
         └──────────────────────────────────────────┼────┘
                                                    │
              ┌─────── AC mains 220V ───────────────┘
              │                                     ▲
              │  L ──┬── COM1 (ช่อง 1)            ดวงไฟ
              │      └── COM2 (ช่อง 2)             │
              │                                     │
              │  N ──────────────────────────────── ดวงไฟ (อีกขั้ว)
              │
              └─ ground/earth (ถ้ามี)
```

## AC load wiring (220V — ระวังไฟดูด)

ต่อสายไฟบ้านเฉพาะตอน **ปลด USB ออกจาก NodeMCU แล้ว** เท่านั้น

- **L (Live, สายไฟ)** ของไฟบ้าน → ต่อเข้า COM ของ relay channel นั้นๆ (COM1 สำหรับดวง 1, COM2 สำหรับดวง 2)
- ขั้วหนึ่งของดวงไฟ → ต่อเข้า NO ของ channel นั้น
- อีกขั้วของดวงไฟ → ต่อกลับเข้า N (Neutral) ของไฟบ้าน
- **ไม่ใช้ NC** (NC = Normally Closed, ปกติติด — ไม่ตรงกับเจตนาเรา)

## ข้อควรระวัง

1. **Power budget** — relay coil 2 ตัวพร้อมกันอาจดึงเกิน 500mA ที่ peak ถ้า USB hub จ่ายไม่พอ จะรีสตาร์ทเอง ใช้ adapter 5V/1A ขึ้นไปแยกต่างหาก หรือ desolder jumper **JD-VCC** ที่ relay module แล้วจ่าย 5V ให้ coil แยกจาก logic (จะได้ optoisolation จริง)
2. **Boot glitch** — ตอน ESP8266 boot, GPIO5/12 จะ float สั้นๆ ก่อน `pinMode()` ใน `setup()` ทำงาน → relay low-trigger อาจ click หนึ่งครั้ง ถ้ารบกวนให้ pull-up **10kΩ** จาก IN1/IN2 ไปยัง 3.3V (Vcc ของ ESP, ไม่ใช่ 5V — ESP8266 GPIO ทน 3.3V เท่านั้น)
3. **220V safety** — ต้องมีกล่องหุ้ม, terminal block / wire nut แน่นหนา, ห้ามให้สาย AC สัมผัสกับฝั่ง logic 5V ถ้าไม่มั่นใจให้ใช้ relay module ที่มี optoisolation ครบ (มี jumper JD-VCC) + แยกแหล่งจ่าย
4. **VC-02 ต้องใช้ Vin (5V)** — ไม่ใช่ 3.3V

## Override macro (ถ้าจะใช้ pin อื่น)

ใส่ build flag ใน `platformio.ini`:

```ini
build_flags =
  -DLIGHT_PIN_OUT1=D2
  -DLIGHT_PIN_OUT2=D1
  -DACTIVE_LOW_OUT1=0
  -DACTIVE_LOW_OUT2=0
```

ค่า default ใน `src/main.cpp` (D1 + D6, active-LOW ทั้งคู่) จะถูก override
