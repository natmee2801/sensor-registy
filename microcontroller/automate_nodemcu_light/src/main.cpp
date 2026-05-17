#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <SoftwareSerial.h>

#if __has_include("secrets.h")
#include "secrets.h"
#endif

#ifndef MQTT_HOST
#define MQTT_HOST "192.168.1.100"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif

// 2-output lighting: out1 on built-in LED (active-low), out2 on D2 (active-high)
#ifndef LIGHT_PIN_OUT1
#define LIGHT_PIN_OUT1 LED_BUILTIN
#endif
#ifndef LIGHT_PIN_OUT2
#define LIGHT_PIN_OUT2 D2
#endif
// out1 is the built-in LED on NodeMCU which is active-LOW
// out2 is a generic GPIO; configure ACTIVE_LOW_OUT2 if your relay is also active-low
#ifndef ACTIVE_LOW_OUT1
#define ACTIVE_LOW_OUT1 1
#endif
#ifndef ACTIVE_LOW_OUT2
#define ACTIVE_LOW_OUT2 0
#endif

#define FW_VERSION "2.0.0"
#define MODEL_NAME "nodemcu_light_2ch"
#define ID_FILE "/id.txt"
#define OUTPUT_COUNT 2

static const char *OUTPUT_NAMES[OUTPUT_COUNT] = {"out1", "out2"};
static const uint8_t OUTPUT_PINS[OUTPUT_COUNT] = {LIGHT_PIN_OUT1, LIGHT_PIN_OUT2};
static const uint8_t OUTPUT_ACTIVE_LOW[OUTPUT_COUNT] = {ACTIVE_LOW_OUT1, ACTIVE_LOW_OUT2};

static const unsigned long HELLO_INTERVAL_MS = 5000;
static const unsigned long HEARTBEAT_INTERVAL_MS = 30000;

// VC-02-Kit voice module (UART, bidirectional)
// ESP RX  D7 (GPIO13) ◄── VC-02 TX  — รับ command bytes
// ESP TX  D5 (GPIO14) ──► VC-02 RX  — ส่งคำสั่งกลับ (เผื่อใช้ในอนาคต)
#define VC02_RX_PIN D7
#define VC02_TX_PIN D5
#define VC02_BAUD 115200
// ESP ไม่ track wake state เอง — เชื่อ VC-02 ที่ gating internal:
// ถ้า packet มาถึง ESP แสดงว่า module ยังฟังอยู่ apply ตรงๆ

// VC-02 5-byte protocol: [0x5a, cmd, 0x00, 0x00, checksum]
// checksum = (byte0 + byte1 + byte2 + byte3) & 0xff
#define VC02_HEADER 0x5a
#define VC02_CMD_WAKE 0x00     // "hey pudding" / "hello pudding"
#define VC02_CMD_EXIT 0x01     // "goodbye" / "see you"
#define VC02_CMD_TURN_ON 0x27  // "turn on the light"   — เปิดดวง 1 (out1)
#define VC02_CMD_TURN_OFF 0x28 // "turn off the light"  — ปิดหมด (both off)
#define VC02_CMD_COLD_ON 0x29  // "cold light turn on"  — out1 ON
#define VC02_CMD_COLD_OFF 0x2a // "cold light turn off" — out1 OFF
#define VC02_CMD_WARM_ON 0x2b  // "warm light turn on"  — เปิด 2 ดวง (both on)
#define VC02_CMD_WARM_OFF 0x2c // "warm light turn off" — out2 OFF (ปิด 1 ดวง = out2)

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
SoftwareSerial vcSerial;

String deviceId;     // empty if not paired
String macClean;     // AA:BB:CC:DD:EE:FF (uppercase)
String cmdTopic;     // dev/{id}/cmd
String ackTopic;     // dev/{id}/ack
String hbTopic;      // dev/{id}/hb
String lwtTopic;     // dev/{id}/lwt
String wipeTopic;    // dev/{id}/wipe — backend สั่งให้ลืม id แล้ว re-pair
String pairAckTopic; // pair/ack/{mac}

bool lightOn[OUTPUT_COUNT] = {false, false};
unsigned long lastHelloMs = 0;
unsigned long lastHbMs = 0;

int outputIndexFromName(const char *name)
{
  if (!name)
    return -1;
  for (int i = 0; i < OUTPUT_COUNT; i++)
  {
    if (strcmp(name, OUTPUT_NAMES[i]) == 0)
      return i;
  }
  return -1;
}

void setLight(int idx, bool on)
{
  if (idx < 0 || idx >= OUTPUT_COUNT)
    return;
  lightOn[idx] = on;
  uint8_t level = OUTPUT_ACTIVE_LOW[idx] ? (on ? LOW : HIGH) : (on ? HIGH : LOW);
  digitalWrite(OUTPUT_PINS[idx], level);
}

String loadDeviceId()
{
  if (!LittleFS.exists(ID_FILE))
    return String();
  File f = LittleFS.open(ID_FILE, "r");
  if (!f)
    return String();
  String id = f.readString();
  f.close();
  id.trim();
  return id;
}

void saveDeviceId(const String &id)
{
  File f = LittleFS.open(ID_FILE, "w");
  if (!f)
  {
    Serial.println("[fs] failed to open id.txt for write");
    return;
  }
  f.print(id);
  f.close();
  Serial.printf("[fs] saved device_id=%s\n", id.c_str());
}

void buildTopics()
{
  if (deviceId.length() == 0)
    return;
  cmdTopic = String("dev/") + deviceId + "/cmd";
  ackTopic = String("dev/") + deviceId + "/ack";
  hbTopic = String("dev/") + deviceId + "/hb";
  lwtTopic = String("dev/") + deviceId + "/lwt";
  wipeTopic = String("dev/") + deviceId + "/wipe";
}

void wipeAndRestart(const char *reason)
{
  Serial.printf("[wipe] reason=%s — clearing id.txt + restart\n", reason);
  if (LittleFS.exists(ID_FILE))
  {
    LittleFS.remove(ID_FILE);
  }
  delay(500);
  ESP.restart();
}

void publishHeartbeat()
{
  if (deviceId.length() == 0 || !mqtt.connected())
    return;
  JsonDocument doc;
  JsonObject outs = doc["outputs"].to<JsonObject>();
  for (int i = 0; i < OUTPUT_COUNT; i++)
  {
    JsonObject o = outs[OUTPUT_NAMES[i]].to<JsonObject>();
    o["isOn"] = lightOn[i];
  }
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;
  char buf[192];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  bool ok = mqtt.publish(hbTopic.c_str(), (const uint8_t *)buf, n, true);
  Serial.printf("[mqtt] hb publish=%s rssi=%d\n", ok ? "ok" : "fail", WiFi.RSSI());
}

void publishHello()
{
  if (!mqtt.connected())
    return;
  JsonDocument doc;
  doc["mac"] = macClean;
  doc["model"] = MODEL_NAME;
  doc["fw"] = FW_VERSION;
  char buf[192];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  bool ok = mqtt.publish("pair/hello", (const uint8_t *)buf, n, false);
  Serial.printf("[mqtt] hello publish=%s\n", ok ? "ok" : "fail");
}

void publishAck(const String &cmdId, const char *output, const char *status, bool isOn)
{
  if (!mqtt.connected())
    return;
  JsonDocument doc;
  doc["cmdId"] = cmdId;
  doc["status"] = status;
  doc["output"] = output;
  doc["isOn"] = isOn;
  char buf[160];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(ackTopic.c_str(), (const uint8_t *)buf, n, false);
}

// แยก apply กับ publish เพื่อให้คำสั่ง multi-output (WARM_ON, TURN_OFF, WARM_OFF)
// publish hb แค่ครั้งเดียวต่อคำสั่ง — ไม่ใช่ 1 hb ต่อ output
bool applyLight(int outputIdx, bool desiredOn)
{
  if (outputIdx < 0 || outputIdx >= OUTPUT_COUNT)
    return false;
  if (lightOn[outputIdx] == desiredOn)
    return false; // idempotent
  setLight(outputIdx, desiredOn);
  Serial.printf("[voice] applied output=%s isOn=%d\n",
                OUTPUT_NAMES[outputIdx], desiredOn ? 1 : 0);
  return true;
}

void publishVoiceUpdate(bool changed)
{
  if (!changed)
    return;
  publishHeartbeat();  // backend handleHeartbeat → hb_sync (per output) → SSE
  lastHbMs = millis(); // กัน double publish ในรอบเดียว
}

void handleVoiceCommand(uint8_t cmd)
{
  Serial.printf("[vc02] cmd=0x%02x\n", cmd);

  bool a, b;
  switch (cmd)
  {
  case VC02_CMD_WAKE: // VC-02 รายงานว่าเข้า wake state — informational
  case VC02_CMD_EXIT: // VC-02 รายงานว่าออก wake state — informational
    return;
  case VC02_CMD_TURN_ON: // เปิดดวง 1 (cold)
  case VC02_CMD_COLD_ON: // alias
    publishVoiceUpdate(applyLight(0, true));
    break;
  case VC02_CMD_COLD_OFF: // ปิดเฉพาะดวง 1 (cold)
    publishVoiceUpdate(applyLight(0, false));
    break;
  case VC02_CMD_WARM_OFF: // ปิดเฉพาะดวง 2 (warm)
    publishVoiceUpdate(applyLight(1, false));
    break;
  case VC02_CMD_TURN_OFF: // ปิดหมด
    a = applyLight(0, false);
    b = applyLight(1, false);
    publishVoiceUpdate(a || b);
    break;
  case VC02_CMD_WARM_ON: // เปิด 2 ดวง
    a = applyLight(0, true);
    b = applyLight(1, true);
    publishVoiceUpdate(a || b);
    break;
  default:
    Serial.printf("[vc02] unknown cmd=0x%02x\n", cmd);
    break;
  }
}

void pollVc02()
{
  static uint8_t vcBuf[5];
  static uint8_t vcBufLen = 0;

  while (vcSerial.available() > 0)
  {
    uint8_t b = (uint8_t)vcSerial.read();
    // resync — ถ้า buffer ว่างแต่ byte แรกไม่ใช่ header ก็ทิ้ง
    if (vcBufLen == 0 && b != VC02_HEADER)
      continue;
    vcBuf[vcBufLen++] = b;
    if (vcBufLen < 5)
      continue;

    uint16_t expected = (uint16_t)vcBuf[0] + vcBuf[1] + vcBuf[2] + vcBuf[3];
    if ((expected & 0xff) == vcBuf[4])
    {
      handleVoiceCommand(vcBuf[1]);
    }
    else
    {
      Serial.printf("[vc02] checksum fail %02x %02x %02x %02x %02x\n",
                    vcBuf[0], vcBuf[1], vcBuf[2], vcBuf[3], vcBuf[4]);
    }
    vcBufLen = 0;
  }
}

void onMqttMessage(char *topic, byte *payload, unsigned int len)
{
  Serial.printf("[mqtt] rx %s (%u bytes)\n", topic, len);

  if (deviceId.length() == 0 && pairAckTopic.length() > 0 && pairAckTopic.equals(topic))
  {
    JsonDocument doc;
    if (deserializeJson(doc, payload, len))
      return;
    const char *assigned = doc["device_id"] | (const char *)nullptr;
    if (!assigned)
      return;
    saveDeviceId(String(assigned));
    Serial.println("[pair] got assigned id — rebooting to apply");
    delay(500);
    ESP.restart();
    return;
  }

  if (wipeTopic.length() > 0 && wipeTopic.equals(topic))
  {
    wipeAndRestart("backend wipe signal");
    return;
  }

  if (cmdTopic.length() > 0 && cmdTopic.equals(topic))
  {
    JsonDocument doc;
    if (deserializeJson(doc, payload, len))
    {
      Serial.println("[cmd] json parse failed");
      return;
    }
    const char *cmdId = doc["cmd_id"] | (const char *)nullptr;
    const char *output = doc["output"] | (const char *)nullptr;
    bool desiredOn = doc["isOn"] | false;
    if (!cmdId || !output)
    {
      Serial.println("[cmd] missing cmd_id or output");
      return;
    }
    int idx = outputIndexFromName(output);
    if (idx < 0)
    {
      Serial.printf("[cmd] unknown output=%s\n", output);
      return;
    }
    setLight(idx, desiredOn);
    publishAck(String(cmdId), output, "applied", lightOn[idx]);
  }
}

bool mqttReconnect()
{
  if (mqtt.connected())
    return true;

  String clientId = String(MODEL_NAME) + "-" + macClean;
  clientId.replace(":", "");

  Serial.printf("[mqtt] connecting clientId=%s mode=%s ...\n",
                clientId.c_str(), deviceId.length() ? "paired" : "pairing");

  bool ok;
  if (deviceId.length() > 0)
  {
    ok = mqtt.connect(clientId.c_str(), nullptr, nullptr,
                      lwtTopic.c_str(), 1, true, "offline");
  }
  else
  {
    ok = mqtt.connect(clientId.c_str());
  }

  if (!ok)
  {
    // rc: -4=timeout -3=conn lost -2=conn failed -1=disconnected 1..5=protocol
    Serial.printf("[mqtt] connect failed rc=%d (state=%d)\n", mqtt.state(), mqtt.state());
    return false;
  }

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
}

void connectWifi()
{
#ifdef WIFI_SSID
  Serial.printf("[wifi] connecting to %s (hardcoded)\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 30000)
  {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.printf("[wifi] connect failed (status=%d) — rebooting\n", WiFi.status());
    delay(2000);
    ESP.restart();
  }
  Serial.printf("[wifi] connected ip=%s rssi=%d\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
#else
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
  Serial.printf("[wifi] connected ip=%s\n", WiFi.localIP().toString().c_str());
#endif
}

void setup()
{
  Serial.begin(115200);
  delay(5000);

  Serial.println("\n[boot] sensor-registry light 2ch");
  Serial.printf("[boot] reset reason: %s\n", ESP.getResetReason().c_str());
  Serial.printf("[boot] free heap: %u\n", ESP.getFreeHeap());

  for (int i = 0; i < OUTPUT_COUNT; i++)
  {
    pinMode(OUTPUT_PINS[i], OUTPUT);
    setLight(i, false);
  }

  if (!LittleFS.begin())
  {
    Serial.println("[fs] mount failed — formatting");
    LittleFS.format();
    LittleFS.begin();
  }

  deviceId = loadDeviceId();
  Serial.printf("[boot] stored device_id=%s\n",
                deviceId.length() ? deviceId.c_str() : "(unpaired)");

  connectWifi();

  macClean = WiFi.macAddress(); // AA:BB:CC:DD:EE:FF
  macClean.toUpperCase();
  Serial.printf("[wifi] ip=%s mac=%s\n", WiFi.localIP().toString().c_str(), macClean.c_str());

  buildTopics();

  Serial.printf("[mqtt] target=%s:%d\n", MQTT_HOST, MQTT_PORT);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(60);

  vcSerial.begin(VC02_BAUD, SWSERIAL_8N1, VC02_RX_PIN, VC02_TX_PIN, false);
  if (!vcSerial)
  {
    Serial.println("[vc02] SoftwareSerial init failed");
  }
  else
  {
    Serial.printf("[vc02] listening on D%d @ %lu baud\n",
                  VC02_RX_PIN, (unsigned long)VC02_BAUD);
  }
}

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
  mqtt.loop();
  pollVc02();

  unsigned long now = millis();

  if (deviceId.length() == 0) {
    if (now - lastHelloMs >= HELLO_INTERVAL_MS) {
      lastHelloMs = now;
      publishHello();
    }
  } else {
    if (now - lastHbMs >= HEARTBEAT_INTERVAL_MS) {
      lastHbMs = now;
      publishHeartbeat();
    }
  }
}
