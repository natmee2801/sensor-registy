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
static constexpr LedPattern LED_PATTERNS[] = {
    {0x00000000, 1},  // LED_BOOT             ดับตลอด
    {0b01, 2},        // LED_WIFI_CONNECTING  100 on / 100 off
    {0b0011, 4},      // LED_PORTAL           200 on / 200 off
    {0b0001, 4},      // LED_MQTT_CONNECTING  100 on / 300 off
    {0b00000101, 8},  // LED_PAIRING          100 on/100 off/100 on/500 off
    {0x00000001, 20}, // LED_ONLINE           100 on / 1900 off
};

// กันลืมเพิ่มแถวตอนเพิ่ม state ใหม่ — ถ้าลืม array จะสั้นลงกว่า LED_STATE_COUNT
// (ไม่ใช่ {0,0} เงียบ ๆ เพราะ LED_PATTERNS[] ไม่ระบุขนาด — ลืมแถว = OOB read)
// static_assert ตัวนี้จับ mismatch จำนวนแถวตั้งแต่ตอน compile
static_assert(sizeof(LED_PATTERNS) / sizeof(LED_PATTERNS[0]) == LED_STATE_COUNT,
              "LED_PATTERNS ต้องมีครบทุก state ใน enum LedState");

// mask เป็น uint32_t — shift ด้วยค่า >= 32 คือ undefined behavior (และบน Xtensa
// จะ wrap กลับมาแทนที่จะเป็น 0) ทุกแถวต้องมี slots อยู่ในช่วง 1..32 ไม่งั้น
// ledTickCb() จะ shift เกินขอบเขตของ mask แบบเงียบ ๆ
static constexpr bool ledPatternsValid()
{
  for (size_t i = 0; i < sizeof(LED_PATTERNS) / sizeof(LED_PATTERNS[0]); i++)
    if (LED_PATTERNS[i].slots == 0 || LED_PATTERNS[i].slots > 32)
      return false;
  return true;
}
static_assert(ledPatternsValid(), "slots ต้องอยู่ในช่วง 1..32 — mask เป็น uint32_t");

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
