# Status LED Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ LED built-in (GPIO2/D4) ของ NodeMCU กระพริบเป็น pattern บอกว่า firmware อยู่ state ไหนใน lifecycle — boot → wifi → portal → mqtt → pairing → online — โดยไม่แก้ logic เดิมของ firmware

**Architecture:** โมดูลใหม่ `status_led` แยกจาก `main.cpp` ถือตาราง pattern (`{uint32_t mask; uint8_t slots}` ที่ 100 ms/slot) และขับ LED ผ่าน `Ticker` (os_timer) ที่ SDK เป็นคนยิง callback ให้ตอนโค้ดเรียก `delay()`/`yield()` — จึงกระพริบได้แม้ตอนอยู่ใน `wm.autoConnect()` ที่ไม่มี hook ให้เราแทรก `main.cpp` แค่เพิ่มบรรทัด `ledSetState(...)` ตามจุด transition ไม่แตะ control flow เดิม

**Tech Stack:** C++ / Arduino framework · ESP8266 (NodeMCU v2) · PlatformIO 6.1.13 · `Ticker` (มากับ ESP8266 core ไม่ต้องเพิ่ม `lib_deps`) · WiFiManager v2.0.17 · PubSubClient 2.8

**Spec:** [`docs/superpowers/specs/2026-08-06-status-led-design.md`](../specs/2026-08-06-status-led-design.md)

## Global Constraints

- Branch: `feat/status-led` (แตกจาก `master` แล้ว) — commit ทุก task ไม่ push จนกว่าจะสั่ง
- **`pio` ไม่อยู่ใน PATH** — ต้องเรียกเต็มพาธ `C:\Users\delta\.platformio\penv\Scripts\pio.exe` (PowerShell) หรือ `/c/Users/delta/.platformio/penv/Scripts/pio.exe` (Git Bash)
- **ยังไม่ได้ติดตั้ง platform `espressif8266`** — `pio run` ครั้งแรกจะดาวน์โหลด toolchain + framework ~200 MB ปล่อยให้มันทำจนจบ ตั้ง timeout ยาว (600000 ms)
- **ไม่มี native toolchain** (ไม่มี `gcc`/`g++` บนเครื่อง) → รัน Unity unit test แบบ `pio test -e native` ไม่ได้ automated gate ของทุก task คือ **compile ผ่าน + `static_assert` ผ่าน** ส่วนเรื่อง timing/pattern verify บนฮาร์ดแวร์จริงตาม checklist ใน Task 2
- **ต้องมี `src/secrets.h` ก่อน build** — ตอนนี้ยังไม่มี (มีแค่ `secrets.h.example`) ถ้าไม่ copy จะ fall back ไป `MQTT_HOST "172.25.144.1"` ซึ่งอาจต่อ broker ไม่ได้
- Code style ตาม `src/main.cpp` เดิม: Allman braces, comment ภาษาไทย, macro guard ด้วย `#ifndef`
- ห้ามเพิ่ม `lib_deps` — `Ticker` มากับ ESP8266 core อยู่แล้ว
- ทุก path ในเอกสารนี้อ้างจาก repo root `D:\Repo\sensor-registy`

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `microcontroller/automate_nodemcu_light/src/status_led.h` (สร้าง) | public API 3 ตัว + `enum LedState` + macro override pin/polarity — ผู้เรียกไม่ต้องรู้เรื่อง Ticker/mask/slot |
| `microcontroller/automate_nodemcu_light/src/status_led.cpp` (สร้าง) | ตาราง pattern + Ticker + tick callback + `static_assert` ตรวจตาราง |
| `microcontroller/automate_nodemcu_light/src/main.cpp` (แก้) | เพิ่ม `#include` + `ledSetState()` 7 จุด + `ledStopForRestart()` 4 จุด |
| `microcontroller/automate_nodemcu_light/WIRING.md` (แก้) | ย้าย D4 จากตาราง "ปล่อยว่าง" มาเป็น status LED + ตาราง pattern สำหรับคนดูหน้างาน |

PlatformIO คอมไพล์ `src/*.cpp` อัตโนมัติ — ไม่ต้องแก้ `platformio.ini`

---

### Task 1: โมดูล status_led

โมดูลนี้ไม่รู้จัก MQTT / pairing / WiFi เลย รู้แค่ "ตอนนี้ state อะไร" กับ "แต่ละ state กระพริบยังไง" ยังไม่มีใครเรียกหลังจบ task นี้ — gate คือคอมไพล์ผ่านและตารางถูกตรวจโดย `static_assert`

**Files:**
- Create: `microcontroller/automate_nodemcu_light/src/status_led.h`
- Create: `microcontroller/automate_nodemcu_light/src/status_led.cpp`

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces:
  - `enum LedState : uint8_t { LED_BOOT, LED_WIFI_CONNECTING, LED_PORTAL, LED_MQTT_CONNECTING, LED_PAIRING, LED_ONLINE, LED_STATE_COUNT }`
  - `void ledBegin()` — เรียกครั้งเดียวใน `setup()` ตั้ง pinMode + attach ticker เข้า state `LED_BOOT`
  - `void ledSetState(LedState s)` — idempotent เรียกซ้ำด้วยค่าเดิมไม่มีผล
  - `void ledStopForRestart()` — detach ticker + ดึง pin เป็น HIGH เรียกก่อน `ESP.restart()` ทุกจุด

---

- [ ] **Step 1: สร้าง `src/status_led.h`**

```cpp
#pragma once

#include <Arduino.h>

// LED บอกสถานะ lifecycle ของ firmware — ดูตาราง pattern ที่ ../WIRING.md
//
// ⚠ STATUS_LED_PIN default = GPIO2 (D4) ซึ่งเป็น boot-strap pin ต้อง HIGH ตอน reset
//   ถ้า LED กำลังติด (GPIO2 = LOW) แล้วเรียก ESP.restart() บอร์ดอาจ boot เข้า
//   UART download mode แล้วค้าง → ต้องเรียก ledStopForRestart() ก่อน restart ทุกจุด

#ifndef STATUS_LED_PIN
#define STATUS_LED_PIN LED_BUILTIN // GPIO2 / D4
#endif
#ifndef STATUS_LED_ACTIVE_LOW
#define STATUS_LED_ACTIVE_LOW 1
#endif

enum LedState : uint8_t
{
  LED_BOOT = 0,        // เพิ่ง boot ยังไม่เริ่มต่อ WiFi — ดับ
  LED_WIFI_CONNECTING, // กำลังต่อ WiFi — กระพริบถี่ 100/100
  LED_PORTAL,          // เปิด captive portal รอ user ตั้งค่า — กระพริบช้า 200/200
  LED_MQTT_CONNECTING, // WiFi ได้แล้ว กำลังต่อ broker — แว้บสั้นทุก 400ms
  LED_PAIRING,         // ต่อ broker ได้ ยังไม่ถูก claim — แว้บคู่ทุก 800ms
  LED_ONLINE,          // ปกติ — แว้บสั้นทุก 2 วิ
  LED_STATE_COUNT      // ต้องอยู่ท้ายสุดเสมอ
};

void ledBegin();
void ledSetState(LedState s);
void ledStopForRestart();
```

- [ ] **Step 2: สร้าง `src/status_led.cpp`**

```cpp
#include <Arduino.h>
#include <Ticker.h>

#include "status_led.h"

// tick 100 ms = 1 slot — bit ที่ N ของ mask คือ slot ที่ N (LSB = slot แรก)
// slots = ความยาวคาบก่อนวนซ้ำ เปลี่ยนจังหวะกระพริบได้โดยแก้แค่ตารางนี้
static const uint32_t LED_TICK_MS = 100;

struct LedPattern
{
  uint32_t mask;
  uint8_t slots;
};

// เรียงตาม enum LedState เป๊ะ ๆ — เพิ่ม state ต้องเพิ่มแถวที่นี่ด้วย
static const LedPattern LED_PATTERNS[] = {
    {0x00000000, 1},  // LED_BOOT             ดับตลอด
    {0b01, 2},        // LED_WIFI_CONNECTING  100 on / 100 off
    {0b0011, 4},      // LED_PORTAL           200 on / 200 off
    {0b0001, 4},      // LED_MQTT_CONNECTING  100 on / 300 off
    {0b00000101, 8},  // LED_PAIRING          100 on/100 off/100 on/500 off
    {0x00000001, 20}, // LED_ONLINE           100 on / 1900 off
};

// กันลืมเพิ่มแถวตอนเพิ่ม state ใหม่ — ถ้าลืม แถวที่ขาดจะเป็น {0,0} เงียบ ๆ
// แล้ว modulo ด้วย slots=0 จะพัง static_assert จับตั้งแต่ตอน compile
static_assert(sizeof(LED_PATTERNS) / sizeof(LED_PATTERNS[0]) == LED_STATE_COUNT,
              "LED_PATTERNS ต้องมีครบทุก state ใน enum LedState");

static Ticker ledTicker;
static volatile uint8_t gState = LED_BOOT;
static volatile uint8_t gSlot = 0;

static void ledWrite(bool on)
{
#if STATUS_LED_ACTIVE_LOW
  digitalWrite(STATUS_LED_PIN, on ? LOW : HIGH);
#else
  digitalWrite(STATUS_LED_PIN, on ? HIGH : LOW);
#endif
}

// รันใน SYS task context (os_timer ไม่ใช่ hard ISR) — ปลอดภัยที่จะ digitalWrite
// และอ่าน const array แต่ห้ามแตะ Serial / String / heap allocation ในนี้
static void ledTickCb()
{
  const LedPattern &p = LED_PATTERNS[gState];
  if (p.slots == 0)
  {
    ledWrite(false);
    return;
  }
  uint8_t slot = gSlot;
  if (slot >= p.slots) // ถ้า state เพิ่งเปลี่ยนมาเป็น pattern ที่สั้นกว่าเดิม
    slot = 0;
  ledWrite(((p.mask >> slot) & 1u) != 0);
  gSlot = (uint8_t)((slot + 1) % p.slots);
}

void ledBegin()
{
  pinMode(STATUS_LED_PIN, OUTPUT);
  ledWrite(false);
  gState = LED_BOOT;
  gSlot = 0;
  ledTicker.attach_ms(LED_TICK_MS, ledTickCb);
}

void ledSetState(LedState s)
{
  if (s >= LED_STATE_COUNT)
    return;
  if (gState == (uint8_t)s)
    return; // idempotent — loop() เรียกซ้ำทุกรอบได้โดยไม่รีเซ็ต pattern
  gState = (uint8_t)s;
  gSlot = 0; // เริ่ม pattern ใหม่จาก slot แรก ให้เห็นการเปลี่ยน state ทันที
}

void ledStopForRestart()
{
  ledTicker.detach();
  // ตั้ง HIGH ตรง ๆ ไม่ผ่าน ledWrite() — หน้าที่ของฟังก์ชันนี้คือทำให้ boot-strap
  // pin อยู่ในระดับที่ boot จาก flash ได้ ไม่ใช่ "ปิดไฟ" ถ้าใครไป override เป็น
  // active-high การเรียก ledWrite(false) จะได้ LOW ซึ่งอันตราย
  digitalWrite(STATUS_LED_PIN, HIGH);
}
```

- [ ] **Step 3: เตรียม `secrets.h` (ยังไม่มีในเครื่อง — build ไม่ผ่านเงื่อนไขจริงถ้าไม่ทำ)**

```powershell
Copy-Item microcontroller\automate_nodemcu_light\src\secrets.h.example microcontroller\automate_nodemcu_light\src\secrets.h
```

แก้ `MQTT_HOST` ให้เป็น IP ของเครื่องที่รัน docker mosquitto บน LAN (หาได้จาก `ipconfig`) ไฟล์นี้ gitignored — จะไม่ติดไปกับ commit

- [ ] **Step 4: Build เพื่อยืนยันว่า compile ผ่าน + `static_assert` ผ่าน**

Run (ครั้งแรกจะดาวน์โหลด toolchain ~200 MB ใช้เวลานาน — ตั้ง timeout 600000):

```powershell
& "C:\Users\delta\.platformio\penv\Scripts\pio.exe" run -d microcontroller\automate_nodemcu_light
```

Expected: `SUCCESS` และเห็น `Compiling .pio\build\nodemcuv2\src\status_led.cpp.o` ในผลลัพธ์

ถ้าเห็น `static assertion failed: LED_PATTERNS ต้องมีครบทุก state` แปลว่าจำนวนแถวในตารางไม่ตรงกับ enum — แก้ให้ตรงก่อนไปต่อ

- [ ] **Step 5: พิสูจน์ว่า `static_assert` ทำงานจริง (ไม่ใช่ assert ที่ไม่มีวันยิง)**

ลบแถวสุดท้าย (`{0x00000001, 20}, // LED_ONLINE`) ออกจาก `LED_PATTERNS` ชั่วคราว แล้ว build ซ้ำ:

```powershell
& "C:\Users\delta\.platformio\penv\Scripts\pio.exe" run -d microcontroller\automate_nodemcu_light
```

Expected: **FAIL** ด้วย `static assertion failed: LED_PATTERNS ต้องมีครบทุก state ใน enum LedState`

ถ้าคอมไพล์ผ่าน = assert ใช้ไม่ได้ ต้องแก้ก่อน จากนั้น**ใส่แถวกลับ** แล้ว build อีกครั้งให้ได้ `SUCCESS`

- [ ] **Step 6: Commit**

```bash
cd /d/Repo/sensor-registy
git add microcontroller/automate_nodemcu_light/src/status_led.h microcontroller/automate_nodemcu_light/src/status_led.cpp
git commit -m "feat(firmware): โมดูล status_led ขับ LED built-in ด้วย Ticker

ตาราง pattern เป็น {mask, slots} ที่ 100ms/slot — เปลี่ยนจังหวะกระพริบ
ได้โดยแก้แค่ตาราง static_assert กันลืมเพิ่มแถวตอนเพิ่ม state ใหม่

ยังไม่มีใครเรียกใน task นี้ — main.cpp ต่อใน task ถัดไป"
```

หมายเหตุ: `git add` ระบุไฟล์เจาะจง ไม่ใช้ `git add -A` เพราะ `.pio/` (build artifact) ไม่ควรติดไป — ตรวจด้วย `git status --short` ก่อน commit ว่ามีแค่ 2 ไฟล์นี้

---

### Task 2: เชื่อมเข้า main.cpp + verify บนฮาร์ดแวร์

State transition กับ `ledStopForRestart()` อยู่ใน task เดียวกันโดยตั้งใจ — ถ้าแยก จะมีช่วงที่ LED ติดได้แล้วแต่ยังไม่มีตัวกัน boot-strap ซึ่งคือเคสที่อันตรายที่สุดพอดี

**Files:**
- Modify: `microcontroller/automate_nodemcu_light/src/main.cpp` (11 จุด — รายละเอียดแต่ละจุดใน step)

**Interfaces:**
- Consumes จาก Task 1: `ledBegin()`, `ledSetState(LedState)`, `ledStopForRestart()`, `enum LedState`
- Produces: ไม่มี API ใหม่ (task สุดท้ายที่แตะโค้ด)

---

- [ ] **Step 1: เพิ่ม include**

ใน `src/main.cpp` หลังบรรทัด `#include <SoftwareSerial.h>` (บรรทัด 7) เพิ่ม:

```cpp
#include "status_led.h"
```

- [ ] **Step 2: `ledBegin()` เป็นบรรทัดแรกของ `setup()`**

หา:

```cpp
void setup()
{
  Serial.begin(115200);
  delay(5000);
```

แทนด้วย:

```cpp
void setup()
{
  ledBegin(); // ตั้ง LED ก่อนอย่างอื่น — delay(5000) ข้างล่างจะได้เห็น state BOOT
  Serial.begin(115200);
  delay(5000);
```

- [ ] **Step 3: `LED_WIFI_CONNECTING` + guard restart ใน `connectWifi()` branch `WIFI_SSID`**

หา:

```cpp
#ifdef WIFI_SSID
  Serial.printf("[wifi] connecting to %s (hardcoded)\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
```

แทนด้วย:

```cpp
#ifdef WIFI_SSID
  Serial.printf("[wifi] connecting to %s (hardcoded)\n", WIFI_SSID);
  ledSetState(LED_WIFI_CONNECTING);
  WiFi.mode(WIFI_STA);
```

จากนั้นหา (ใน branch เดียวกัน):

```cpp
    Serial.printf("[wifi] connect failed (status=%d) — rebooting\n", WiFi.status());
    delay(2000);
    ESP.restart();
```

แทนด้วย:

```cpp
    Serial.printf("[wifi] connect failed (status=%d) — rebooting\n", WiFi.status());
    ledStopForRestart();
    delay(2000);
    ESP.restart();
```

- [ ] **Step 4: `LED_WIFI_CONNECTING` + `LED_PORTAL` + guard restart ใน branch WiFiManager**

หา:

```cpp
  WiFiManager wm;
  wm.setDebugOutput(true);
  wm.setConnectTimeout(20);
  wm.setConfigPortalTimeout(180);
  String apName = String("light-setup-") + String((uint32_t)ESP.getChipId(), HEX);
  Serial.printf("[wifi] starting autoConnect, AP=%s\n", apName.c_str());
  if (!wm.autoConnect(apName.c_str()))
  {
    Serial.println("[wifi] auto-connect failed — rebooting");
    delay(2000);
    ESP.restart();
  }
```

แทนด้วย:

```cpp
  WiFiManager wm;
  wm.setDebugOutput(true);
  wm.setConnectTimeout(20);
  wm.setConfigPortalTimeout(180);
  // autoConnect() block ได้ถึง 180 วิ และไม่มี hook ให้แทรก tick ของเรา —
  // เปลี่ยน state ผ่าน callback ตอนมันเปิด AP แล้วปล่อยให้ Ticker ทำงานเอง
  wm.setAPCallback([](WiFiManager *)
                   { ledSetState(LED_PORTAL); });
  String apName = String("light-setup-") + String((uint32_t)ESP.getChipId(), HEX);
  Serial.printf("[wifi] starting autoConnect, AP=%s\n", apName.c_str());
  ledSetState(LED_WIFI_CONNECTING);
  if (!wm.autoConnect(apName.c_str()))
  {
    Serial.println("[wifi] auto-connect failed — rebooting");
    ledStopForRestart();
    delay(2000);
    ESP.restart();
  }
```

- [ ] **Step 5: `LED_MQTT_CONNECTING` หลัง WiFi ได้แล้ว**

ใน `setup()` หา:

```cpp
  Serial.printf("[mqtt] target=%s:%d\n", MQTT_HOST, MQTT_PORT);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
```

แทนด้วย:

```cpp
  ledSetState(LED_MQTT_CONNECTING);
  Serial.printf("[mqtt] target=%s:%d\n", MQTT_HOST, MQTT_PORT);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
```

- [ ] **Step 6: `LED_ONLINE` / `LED_PAIRING` ตอน `mqttReconnect()` สำเร็จ**

หา:

```cpp
  Serial.println("[mqtt] connected");
  if (deviceId.length() > 0)
  {
    mqtt.subscribe(cmdTopic.c_str(), 1);
    mqtt.subscribe(wipeTopic.c_str(), 1);
    Serial.printf("[mqtt] subscribed %s + %s\n",
                  cmdTopic.c_str(), wipeTopic.c_str());
    publishHeartbeat();
  }
  else
  {
    pairAckTopic = String("pair/ack/") + macClean;
    mqtt.subscribe(pairAckTopic.c_str(), 1);
    Serial.printf("[mqtt] subscribed %s (pairing mode)\n", pairAckTopic.c_str());
  }
  return true;
```

แทนด้วย:

```cpp
  Serial.println("[mqtt] connected");
  if (deviceId.length() > 0)
  {
    mqtt.subscribe(cmdTopic.c_str(), 1);
    mqtt.subscribe(wipeTopic.c_str(), 1);
    Serial.printf("[mqtt] subscribed %s + %s\n",
                  cmdTopic.c_str(), wipeTopic.c_str());
    publishHeartbeat();
    ledSetState(LED_ONLINE);
  }
  else
  {
    pairAckTopic = String("pair/ack/") + macClean;
    mqtt.subscribe(pairAckTopic.c_str(), 1);
    Serial.printf("[mqtt] subscribed %s (pairing mode)\n", pairAckTopic.c_str());
    ledSetState(LED_PAIRING);
  }
  return true;
```

- [ ] **Step 7: state ตอนหลุดใน `loop()`**

หา:

```cpp
void loop()
{
  if (WiFi.status() != WL_CONNECTED) {
    delay(500);
    return;
  }

  if (!mqtt.connected()) {
    if (!mqttReconnect()) {
      delay(2000);
      return;
    }
  }
```

แทนด้วย:

```cpp
void loop()
{
  if (WiFi.status() != WL_CONNECTED) {
    ledSetState(LED_WIFI_CONNECTING);
    delay(500);
    return;
  }

  if (!mqtt.connected()) {
    ledSetState(LED_MQTT_CONNECTING);
    if (!mqttReconnect()) {
      delay(2000);
      return;
    }
  }
```

(`ledSetState` idempotent — เรียกซ้ำทุกรอบ loop ไม่รีเซ็ต pattern)

- [ ] **Step 8: guard restart ใน `wipeAndRestart()`**

หา:

```cpp
  if (LittleFS.exists(ID_FILE))
  {
    LittleFS.remove(ID_FILE);
  }
  delay(500);
  ESP.restart();
```

แทนด้วย:

```cpp
  if (LittleFS.exists(ID_FILE))
  {
    LittleFS.remove(ID_FILE);
  }
  ledStopForRestart();
  delay(500);
  ESP.restart();
```

- [ ] **Step 9: guard restart ตอนได้ pair ack**

ใน `onMqttMessage()` หา:

```cpp
    saveDeviceId(String(assigned));
    Serial.println("[pair] got assigned id — rebooting to apply");
    delay(500);
    ESP.restart();
```

แทนด้วย:

```cpp
    saveDeviceId(String(assigned));
    Serial.println("[pair] got assigned id — rebooting to apply");
    ledStopForRestart();
    delay(500);
    ESP.restart();
```

- [ ] **Step 10: ตรวจว่า guard ครบทุกจุด restart — ไม่มีตกหล่น**

Run:

```bash
cd /d/Repo/sensor-registy/microcontroller/automate_nodemcu_light
grep -n -B4 "ESP.restart()" src/main.cpp
```

Expected: เจอ `ESP.restart()` **4 จุด** และทุกจุดมี `ledStopForRestart();` อยู่ก่อนหน้าภายใน 4 บรรทัด
(`wipeAndRestart`, `onMqttMessage` pair-ack, `connectWifi` branch `WIFI_SSID`, `connectWifi` branch WiFiManager)

ถ้าเจอจุดที่ไม่มี guard — เพิ่มก่อนไปต่อ นี่คือจุดที่ทำให้บอร์ดค้าง download mode

- [ ] **Step 11: Build**

Run:

```powershell
& "C:\Users\delta\.platformio\penv\Scripts\pio.exe" run -d microcontroller\automate_nodemcu_light
```

Expected: `SUCCESS` ไม่มี warning เรื่อง unused function หรือ implicit declaration

- [ ] **Step 12: Flash + ดู serial log**

เสียบ NodeMCU แล้ว run:

```powershell
& "C:\Users\delta\.platformio\penv\Scripts\pio.exe" run -d microcontroller\automate_nodemcu_light -t upload
& "C:\Users\delta\.platformio\penv\Scripts\pio.exe" device monitor -d microcontroller\automate_nodemcu_light
```

(baud 115200 ตั้งไว้ใน `platformio.ini` แล้ว — ออกจาก monitor ด้วย `Ctrl+C`)

- [ ] **Step 13: Verify บนฮาร์ดแวร์ — เคสที่ทำได้โดยไม่ต้องมี backend**

ต้องผ่านทุกข้อ ถ้าข้อไหนไม่ตรงให้หยุดแล้วแก้ก่อน commit

| # | เคส | วิธีทำ | คาดหวัง |
|---|---|---|---|
| 1 | Boot ปกติ | ดูตั้งแต่จ่ายไฟ | ดับ ~5 วิ → กระพริบถี่ → แว้บทุก 400ms → (paired) แว้บทุก 2 วิ |
| 2 | WiFi ต่อไม่ได้ | **ต้อง define `WIFI_SSID`/`WIFI_PASSWORD` ใน `secrets.h` ก่อน** (default ใน example คอมเมนต์ไว้ = ใช้ WiFiManager) แล้วใส่ password ผิด flash | ค้างกระพริบถี่จนครบ 30 วิ แล้ว reboot |
| 4 | Unpaired | `pio.exe run -d ... -t erase` แล้ว flash ใหม่ | จบที่แว้บคู่ทุก 800ms (`pair/hello` ใน log) |
| 7 | Captive portal | คอมเมนต์ `WIFI_SSID`/`WIFI_PASSWORD` ใน `secrets.h` + `-t erase` แล้ว flash | ตอน AP `light-setup-XXXX` ขึ้น → กระพริบช้า 200/200 |
| 8 | **Restart ขณะ LED ติด** | กดปุ่ม RST 10 ครั้งรัว ๆ ตอนอยู่เคส 4 (แว้บคู่) | boot ผ่านทุกครั้ง — ไม่ค้าง ไม่มี log เงียบ |

**ช่วงกระพริบถี่อาจสั้นมากจนเกือบไม่เห็น** ถ้า WiFi ต่อติดภายใน 1-2 วิ — อันนี้ปกติ ไม่ใช่ fail ให้ยืนยันด้วย log `[wifi] connected ip=...` ว่ามันผ่าน state นั้นมาจริง ถ้าอยากเห็นชัดให้ทดสอบเคส 2 แทน

เคส 7 คือตัวพิสูจน์สมมติฐานหลักของ design ว่า WiFiManager เรียก `delay()`/`yield()` ข้างในจริง (ยังไม่เคยอ่าน source ยืนยัน) **ถ้า LED ค้างแทนที่จะกระพริบตอนเปิด portal = สมมติฐานผิด** ให้หยุดแล้วรายงาน — fallback คือเปลี่ยนไปใช้ `timer1_attachInterrupt` ซึ่งต้องแก้ design ก่อน

เคส 8 คือตัวจับ regression ของความเสี่ยง boot-strap GPIO2 โดยตรง

- [ ] **Step 14: Verify เคสที่ต้องมี backend + broker**

เปิด stack ก่อน (จาก repo root):

```powershell
docker compose up -d
npm --prefix application/backend run dev
npm --prefix application/frontend run dev
```

| # | เคส | วิธีทำ | คาดหวัง |
|---|---|---|---|
| 3 | Broker ตาย | `docker compose stop mosquitto` ตอน ESP online | แว้บทุก 2 วิ → เปลี่ยนเป็นแว้บทุก 400ms ภายใน ~60 วิ (keepalive) |
| 5 | Claim จาก UI | กด Claim ที่แท็บ Pairing ตอน ESP อยู่เคส 4 | แว้บคู่ → restart → แว้บทุก 2 วิ |
| 6 | Remove จาก UI | `DELETE /api/devices/{id}` (หรือกดลบใน UI) | ได้ wipe → restart → กลับไปแว้บคู่ |

เคส 3 ต้องรอ keepalive timeout (`mqtt.setKeepAlive(60)`) — ไม่ใช่ทันที อย่าตัดสินว่า fail เร็วเกินไป

- [ ] **Step 15: Commit**

```bash
cd /d/Repo/sensor-registy
git status --short
git add microcontroller/automate_nodemcu_light/src/main.cpp
git commit -m "feat(firmware): เชื่อม status LED เข้ากับ lifecycle ใน main.cpp

เพิ่ม ledSetState() 7 จุดตาม state transition และ ledStopForRestart()
ครบทั้ง 4 จุดที่เรียก ESP.restart() — ไม่แตะ control flow เดิม

ledStopForRestart() ต้องมาพร้อมกันใน commit เดียว เพราะ GPIO2 เป็น
boot-strap pin ถ้า LED ติดค้างตอน soft reset บอร์ดจะ boot เข้า UART
download mode แล้วค้าง

verify บนฮาร์ดแวร์ครบ 8 เคสตาม spec §6"
```

ตรวจให้แน่ใจว่า `git status --short` ไม่มี `src/secrets.h` (ต้องถูก gitignore) และไม่มี `.pio/`

---

### Task 3: อัปเดต WIRING.md

D4 ไม่ใช่ pin ว่างอีกต่อไป เอกสารหน้างานต้องตรงกับของจริง ไม่งั้นคนต่อวงจรรอบหน้าจะเอา D4 ไปใช้แล้วชนกัน

**Files:**
- Modify: `microcontroller/automate_nodemcu_light/WIRING.md`

**Interfaces:**
- Consumes: ตาราง pattern จาก Task 1 (`LED_PATTERNS` ใน `src/status_led.cpp`)
- Produces: ไม่มี

---

- [ ] **Step 1: เพิ่ม D4 เข้าตาราง Pinout**

หาแถวสุดท้ายของตาราง Pinout:

```markdown
| **D7** | GPIO13 | IN  | ← VC-02 TX (SoftwareSerial RX) | `VC02_RX_PIN` |
```

เพิ่มแถวต่อท้าย:

```markdown
| **D4** | GPIO2  | OUT | → LED built-in บนโมดูล ESP-12 (status LED, active-LOW) | `STATUS_LED_PIN` |
```

- [ ] **Step 2: แก้แถว D4 ในตาราง "pin ที่ตั้งใจปล่อยว่าง"**

หา:

```markdown
| D4 | GPIO2  | boot-strap (ต้อง HIGH at boot), shared LED |
```

แทนด้วย:

```markdown
| ~~D4~~ | GPIO2 | **ใช้แล้ว** — status LED (ดูตารางบน) ยังเป็น boot-strap ต้อง HIGH at boot จึงห้ามต่ออะไรเพิ่ม |
```

- [ ] **Step 3: แก้ ASCII diagram**

หา:

```
                │ D4 (LED) — ปล่อยว่าง    │      VCC ◄──┘  (จาก Vin 5V)
```

แทนด้วย:

```
                │ D4 → status LED (on-board) │   VCC ◄──┘  (จาก Vin 5V)
```

- [ ] **Step 4: เพิ่มหัวข้อ Status LED ก่อนหัวข้อ `## ข้อควรระวัง`**

แทรกก่อนบรรทัด `## ข้อควรระวัง`:

```markdown
## Status LED (D4 / GPIO2)

LED บนโมดูล ESP-12 กระพริบบอกว่า firmware อยู่ state ไหน — ดูดวงเดียวรู้เลยว่าค้างตรงไหนโดยไม่ต้องเสียบ serial monitor

| จังหวะ | ความหมาย | ทำอะไรต่อ |
|---|---|---|
| ดับ | เพิ่ง boot (~5 วิแรก) | รอ |
| กระพริบถี่ 100/100 ms | กำลังต่อ WiFi | ถ้าค้าง = SSID/password ผิด หรือ AP ไม่อยู่ในระยะ |
| กระพริบช้า 200/200 ms | เปิด captive portal `light-setup-XXXX` | ต่อ WiFi เข้า AP นั้นแล้วตั้งค่า |
| แว้บสั้น 1 ครั้ง/400 ms | WiFi ได้แล้ว กำลังต่อ MQTT broker | ถ้าค้าง = `MQTT_HOST` ผิด, broker ไม่ทำงาน, หรือ ESP อยู่คนละ subnet |
| แว้บสั้น 2 ครั้ง/800 ms | ต่อ broker ได้ ยังไม่ถูก claim | ไปกด Claim ที่แท็บ Pairing ใน UI |
| แว้บสั้น 1 ครั้ง/2 วิ | ปกติ ทุกอย่างเรียบร้อย | — |

**อย่าต่ออะไรเพิ่มที่ D4** — GPIO2 เป็น boot-strap pin ต้องเป็น HIGH ตอน reset ถ้าโดนดึง LOW ค้าง บอร์ดจะ boot เข้า UART download mode แล้วค้าง firmware จึงเรียก `ledStopForRestart()` ดึง pin กลับเป็น HIGH ก่อน `ESP.restart()` ทุกจุด

เปลี่ยน pin หรือ polarity ได้ด้วย build flag `-DSTATUS_LED_PIN=D2` / `-DSTATUS_LED_ACTIVE_LOW=0` (ดูหัวข้อ Override macro ข้างล่าง)
```

- [ ] **Step 5: ตรวจว่าตาราง pattern ในเอกสารตรงกับโค้ดจริง**

Run:

```bash
cd /d/Repo/sensor-registy/microcontroller/automate_nodemcu_light
grep -n "LED_" src/status_led.cpp | grep -E "0b|0x"
```

Expected: 6 แถว และคาบที่คำนวณได้ (slots × 100 ms) ตรงกับคอลัมน์ "จังหวะ" ในตารางที่เพิ่งเขียน — `{0b01,2}`=200ms, `{0b0011,4}`=400ms, `{0b0001,4}`=400ms, `{0b00000101,8}`=800ms, `{0x00000001,20}`=2000ms

- [ ] **Step 6: Commit**

```bash
cd /d/Repo/sensor-registy
git add microcontroller/automate_nodemcu_light/WIRING.md
git commit -m "docs(firmware): WIRING.md — D4 ไม่ใช่ pin ว่างแล้ว เป็น status LED

เพิ่มตารางแปลจังหวะกระพริบ → ความหมาย → ทำอะไรต่อ สำหรับคนที่ต้อง
debug หน้างานโดยไม่มี serial monitor"
```

---

## หลังทำครบทุก task

- [ ] `git log --oneline master..feat/status-led` — ควรเห็น 5 commit (spec 2 + code 2 + docs 1)
- [ ] เปิด PR เข้า `master` ตาม branch policy ใน `CLAUDE.md` (ไม่ commit ตรงเข้า master)

## สิ่งที่ตั้งใจไม่ทำ

- **ไม่มี native unit test** — เครื่องนี้ไม่มี `gcc`/`g++` (ตรวจแล้ว) `pio test -e native` จึงรันไม่ได้ ถ้าอนาคตติดตั้ง MinGW แล้วอยากได้ test จริง ให้แยก `LED_PATTERNS` + logic คำนวณ slot ออกเป็นไฟล์ที่ไม่ include `Arduino.h` แล้วเพิ่ม `[env:native]` — โครงสร้างตอนนี้แยกไว้ให้แล้วบางส่วน (`ledTickCb` เป็นตัวเดียวที่ผูกกับ `digitalWrite`)
- **ไม่มี `LED_ERROR`** — เหตุผลใน spec §5: state ค้างนานดูออกจาก pattern เดิมได้อยู่แล้ว และการเพิ่ม retry counter จะทำให้โมดูล LED ต้องรู้เรื่อง MQTT
- **ไม่แตะ backend/frontend** — งานนี้อยู่ในขอบเขต firmware ล้วน
