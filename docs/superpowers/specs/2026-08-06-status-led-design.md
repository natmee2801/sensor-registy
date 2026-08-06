# Status LED — บอกสถานะ WiFi / MQTT ผ่าน LED built-in

**วันที่:** 2026-08-06
**Scope:** `microcontroller/automate_nodemcu_light`
**Branch:** `feat/status-led`

## ปัญหา

ตอนนี้เวลา ESP boot แล้วไม่ทำงาน ต้องเสียบ USB เปิด `pio device monitor` ถึงจะรู้ว่าค้างตรงไหน — ต่อ WiFi ไม่ได้? ต่อ broker ไม่ได้? หรือต่อได้แล้วแต่ยังไม่ถูก claim? พอเอาไปติดตั้งบนเพดานจริงก็ดูไม่ได้แล้ว

LED built-in บนบอร์ด (GPIO2) ยังว่างอยู่ ใช้บอกสถานะได้โดยไม่ต้องเพิ่มฮาร์ดแวร์

## เป้าหมาย

ดู LED ดวงเดียวแล้วรู้ว่า ESP อยู่ state ไหนใน lifecycle — ตั้งแต่ boot จนถึง online ปกติ โดย**ไม่แก้ logic เดิมของ firmware**

## Non-goals

- ไม่ทำ LED บอก state ของดวงไฟ (`out1`/`out2`) — นั่นดูจาก relay/ดวงไฟจริงได้อยู่แล้ว
- ไม่ทำ error code แบบนับจำนวนกระพริบ (blink-count) — over-engineering สำหรับ 6 state
- ไม่แตะ backend / frontend

---

## 1. Hardware

| รายการ | ค่า |
|---|---|
| Pin | `LED_BUILTIN` = **GPIO2 (D4)** |
| Polarity | active LOW (`digitalWrite(LOW)` = ติด) |
| Override | macro `STATUS_LED_PIN`, `STATUS_LED_ACTIVE_LOW` (ใส่ผ่าน `build_flags` ได้) |

GPIO2 อยู่ในตาราง "pin ที่ตั้งใจปล่อยว่าง" ของ [`WIRING.md`](../../../microcontroller/automate_nodemcu_light/WIRING.md) อยู่แล้ว ไม่ชนกับ relay (D1/D6) และไม่ชนกับ VC-02 SoftwareSerial (D7/D5)

### ความเสี่ยง boot-strap ที่ต้องออกแบบเผื่อ

GPIO2 เป็น boot-strap pin — ROM bootloader อ่านค่าตอน reset เพื่อเลือก boot mode และ**ต้องเป็น HIGH** ถึงจะ boot จาก flash

ถ้า LED กำลังติดอยู่ (GPIO2 = LOW) แล้วโค้ดเรียก `ESP.restart()` พอดี → soft reset อาจอ่าน boot mode ผิดแล้วค้างที่ UART download mode

**วิธีแก้:** ทุกจุดที่ restart ต้องเรียก `ledStopForRestart()` ก่อน — detach ticker + `digitalWrite(HIGH)` ให้ pin อยู่ในสถานะปลอดภัยแน่นอน ไม่พึ่งจังหวะของ pattern

---

## 2. Pattern table

Tick ทุก **100 ms** = 1 slot แต่ละ state เก็บเป็น `{uint32_t mask; uint8_t slots;}` — bit ที่ N ของ mask คือ slot ที่ N (LSB = slot แรก), `slots` คือความยาวคาบก่อนวนซ้ำ

| State | mask | slots | คาบ | ภาพ | ความหมาย |
|---|---|---|---|---|---|
| `LED_BOOT` | `0b0` | 1 | — | ดับ | เพิ่ง boot ยังไม่เริ่มต่อ WiFi |
| `LED_WIFI_CONNECTING` | `0b01` | 2 | 200 ms | `▀▄▀▄▀▄▀▄` | กำลังต่อ WiFi (ถี่ = ยังไม่มีเน็ต) |
| `LED_PORTAL` | `0b0011` | 4 | 400 ms | `▀▀▄▄▀▀▄▄` | เปิด captive portal `light-setup-XXXX` รอ user ตั้งค่า |
| `LED_MQTT_CONNECTING` | `0b0001` | 4 | 400 ms | `▀▄▄▄▀▄▄▄` | WiFi ได้แล้ว กำลังต่อ broker |
| `LED_PAIRING` | `0b00000101` | 8 | 800 ms | `▀▄▀▄▄▄▄▄` | ต่อ broker ได้ ยังไม่ถูก claim — กำลัง publish `pair/hello` |
| `LED_ONLINE` | `0b1` | 20 | 2 s | `▀▄▄▄…▄` | ทุกอย่างปกติ (แว้บสั้นทุก 2 วิ = ยังมีชีวิต) |

**หลักการอ่าน:** ยิ่งกระพริบถี่ = ยิ่งอยู่ต้นทางของ lifecycle · ยิ่งเงียบ = ยิ่งใกล้ปกติ

เปลี่ยนคาบภายหลังทำได้โดยแก้ตารางอย่างเดียว ไม่ต้องแตะโค้ดที่ขับ LED

---

## 3. โมดูล — ไฟล์ใหม่

`src/main.cpp` ยาว ~500 บรรทัดแล้ว งานนี้เป็นหน่วยปิดตัวเอง (ไม่ต้องรู้เรื่อง MQTT/pairing/voice เลย) จึงแยกเป็น

```
src/status_led.h     enum LedState + prototype 3 ตัว
src/status_led.cpp   ตาราง pattern + Ticker + tick callback
```

PlatformIO คอมไพล์ `src/*.cpp` ให้อัตโนมัติ ไม่ต้องแก้ `platformio.ini`

### Public API

```cpp
enum LedState : uint8_t {
  LED_BOOT, LED_WIFI_CONNECTING, LED_PORTAL,
  LED_MQTT_CONNECTING, LED_PAIRING, LED_ONLINE
};

void ledBegin();                  // pinMode + ticker.attach_ms(100, tick)
void ledSetState(LedState s);     // เปลี่ยน state — เขียน volatile ตัวเดียว
void ledStopForRestart();         // detach ticker + pin HIGH — เรียกก่อน ESP.restart() ทุกจุด
```

**ทำไมแค่ 3 ตัว:** ผู้เรียกไม่ต้องรู้ว่าข้างในใช้ Ticker หรือ tick เอง ไม่ต้องรู้เรื่อง mask/slot/polarity เปลี่ยน implementation ทีหลังได้โดยไม่กระทบ `main.cpp`

### ทำไม Ticker ไม่ใช่ `ledTick()` ใน loop

โค้ด boot เป็น blocking ทั้งเส้น — `connectWifi()` วน `delay(500)` และ `wm.autoConnect()` block ได้ถึง 180 วินาที (config portal timeout) โดยไม่มี per-iteration hook ให้แทรก

ถ้า tick จาก `loop()` LED จะค้างพอดีในจังหวะที่ต้องการมันที่สุด `Ticker` (มากับ ESP8266 core) ใช้ `os_timer` ซึ่งวิ่งต่อไปได้แม้ user code block อยู่ → ได้ pattern ครบทุก state โดย**ไม่ต้องรื้อ boot flow**

**ความปลอดภัยของ callback:** `os_timer` callback บน ESP8266 รันใน SYS task context (ไม่ใช่ hard ISR) — `digitalWrite()` และอ่าน const array ปลอดภัย callback จะทำแค่ 3 อย่าง: อ่าน state, คำนวณ bit, `digitalWrite` ห้ามแตะ `Serial` / `String` / heap allocation ในนั้น

state เก็บเป็น `volatile uint8_t` ตัวเดียว → assign เป็น atomic ไม่ต้องใช้ lock ระหว่าง `ledSetState()` กับ callback

---

## 4. จุด transition ใน `main.cpp`

เพิ่มบรรทัด `ledSetState(...)` อย่างเดียว ไม่แก้ control flow เดิม

| ที่ | เรียก |
|---|---|
| `setup()` บนสุด ก่อน `delay(5000)` | `ledBegin()` (เข้า `LED_BOOT`) |
| `connectWifi()` เริ่มทั้งสอง branch (`WIFI_SSID` / WiFiManager) | `ledSetState(LED_WIFI_CONNECTING)` |
| `wm.setAPCallback()` — เข้า captive portal | `ledSetState(LED_PORTAL)` |
| หลัง WiFi ต่อได้ ก่อน `mqtt.setServer()` | `ledSetState(LED_MQTT_CONNECTING)` |
| `mqttReconnect()` สำเร็จ | paired → `LED_ONLINE` · unpaired → `LED_PAIRING` |
| `loop()` เจอ `WiFi.status() != WL_CONNECTED` | `ledSetState(LED_WIFI_CONNECTING)` |
| `loop()` เจอ `!mqtt.connected()` | `ledSetState(LED_MQTT_CONNECTING)` |

### จุดที่ต้องเรียก `ledStopForRestart()` ก่อน `ESP.restart()`

ต้องครบทุกจุด ไม่งั้นเสี่ยงบูตค้างตามข้อ 1

1. `wipeAndRestart()` — backend สั่ง wipe
2. `onMqttMessage()` — ได้ `pair/ack` แล้ว save id เสร็จ
3. `connectWifi()` branch `WIFI_SSID` — ต่อไม่ได้ใน 30 วิ
4. `connectWifi()` branch WiFiManager — `autoConnect()` คืน false

`ledSetState()` ที่ `loop()` เรียกซ้ำทุกรอบเป็น idempotent (assign ค่าเดิม) — ไม่ต้องเช็คก่อนเรียก

---

## 5. Error handling

โมดูลนี้ไม่มี failure mode ของตัวเอง — `digitalWrite` ไม่ fail และ `Ticker.attach_ms` ไม่คืน error

state ที่เป็น "ผิดปกติ" ถูก encode เป็น pattern อยู่แล้ว: ต่อ broker ไม่ได้ = ค้างที่ `LED_MQTT_CONNECTING` ตลอด, WiFi หลุด = ค้างที่ `LED_WIFI_CONNECTING`

**ตัดสินใจว่าไม่ทำ `LED_ERROR`:** state "ค้างนาน" ดูออกจาก pattern เดิมได้แล้ว (มันไม่เปลี่ยนไปสักที) การเพิ่ม state ที่ต้อง track retry counter + threshold ทำให้โมดูลต้องรู้เรื่อง MQTT ซึ่งขัดกับ boundary ที่ตั้งไว้

---

## 6. Verify

โปรเจกต์นี้ไม่มี unit test สำหรับ firmware (`test/` มีแต่ README) และ pattern เป็นเรื่อง timing บนฮาร์ดแวร์จริง — verify ด้วยการ flash แล้วไล่เคส ดู LED คู่กับ serial log

| # | เคส | วิธีทำ | คาดหวัง |
|---|---|---|---|
| 1 | Boot ปกติ (paired) | `pio run -t upload` แล้วดู | ถี่ → แว้บ 400ms → แว้บทุก 2 วิ |
| 2 | WiFi ต่อไม่ได้ | ปิด AP / ใส่ password ผิด | ค้างถี่ แล้ว reboot |
| 3 | Broker ตาย | `docker compose stop mosquitto` ตอน ESP online | เปลี่ยนจากแว้บ 2 วิ → แว้บ 400ms |
| 4 | Unpaired | `pio run -t erase` แล้ว boot | จบที่แว้บคู่ 800ms |
| 5 | Claim จาก UI | กด Claim ตอนอยู่เคส 4 | แว้บคู่ → restart → แว้บทุก 2 วิ |
| 6 | Remove จาก UI | `DELETE /api/devices/{id}` | ได้ wipe → restart → กลับไปแว้บคู่ |
| 7 | Captive portal | ไม่ define `WIFI_SSID` + ไม่มี saved credential | แว้บช้า 400/400 ตอนเปิด AP |
| 8 | **Restart ขณะ LED ติด** | reboot ซ้ำ ๆ 10 ครั้ง (เคส 1) | boot ผ่านทุกครั้ง ไม่ค้าง download mode |

เคส 8 คือเคสที่ป้องกัน regression ของความเสี่ยง boot-strap โดยตรง

---

## 7. เอกสารที่ต้องอัปเดตด้วย

- `microcontroller/automate_nodemcu_light/WIRING.md` — ย้าย D4/GPIO2 จากตาราง "ปล่อยว่าง" ไปเป็น status LED + เพิ่ม pattern table ให้คนดูหน้างานเปิดอ่านได้
