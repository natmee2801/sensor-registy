#pragma once

#include <Arduino.h>

// LED บอกสถานะ lifecycle ของ firmware — ดูตาราง pattern ที่ ../WIRING.md
//
// ⚠ STATUS_LED_PIN default = GPIO2 (D4) ซึ่งเป็น boot-strap pin ต้อง HIGH ตอน reset
//   ถ้า LED กำลังติด (GPIO2 = LOW) แล้วเรียก ESP.restart() บอร์ดอาจ boot เข้า
//   UART download mode แล้วค้าง → เรียก ledStopForRestart() ก่อน ESP.restart() ทุกจุด
//   ที่ firmware เป็นคนสั่งเอง (path ที่ guard นี้ครอบไม่ถึง เช่น WiFiManager portal
//   routes ดู WIRING.md หัวข้อ Status LED)

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

// เรียกก่อน ESP.restart() เท่านั้น — ต้องตามด้วย restart จริงเสมอ ห้ามเรียกแล้วปล่อยให้
// firmware ทำงานต่อ เพราะ ticker ถูก detach ไปแล้ว ถ้าไม่ restart LED จะค้างดับเงียบ ๆ
void ledStopForRestart();
