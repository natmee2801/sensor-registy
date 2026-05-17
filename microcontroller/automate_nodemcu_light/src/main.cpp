#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>

#if __has_include("secrets.h")
#include "secrets.h"
#endif

#ifndef MQTT_HOST
#define MQTT_HOST "192.168.1.100"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif

// NodeMCU built-in LED on GPIO2 is active-low (LOW = on)
#define LIGHT_PIN LED_BUILTIN
#define FW_VERSION "1.0.0"
#define MODEL_NAME "nodemcu_light"
#define ID_FILE "/id.txt"

static const unsigned long HELLO_INTERVAL_MS = 5000;
static const unsigned long HEARTBEAT_INTERVAL_MS = 30000;

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String deviceId;     // empty if not paired
String macClean;     // AA:BB:CC:DD:EE:FF (uppercase)
String cmdTopic;     // dev/{id}/cmd
String ackTopic;     // dev/{id}/ack
String hbTopic;      // dev/{id}/hb
String lwtTopic;     // dev/{id}/lwt
String pairAckTopic; // pair/ack/{mac}

bool lightOn = false;
unsigned long lastHelloMs = 0;
unsigned long lastHbMs = 0;

void setLight(bool on)
{
  lightOn = on;
  digitalWrite(LIGHT_PIN, on ? LOW : HIGH);
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
}

void publishHeartbeat()
{
  if (deviceId.length() == 0 || !mqtt.connected())
    return;
  JsonDocument doc;
  doc["isOn"] = lightOn;
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;
  char buf[128];
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

void publishAck(const String &cmdId, const char *status)
{
  if (!mqtt.connected())
    return;
  JsonDocument doc;
  doc["cmdId"] = cmdId;
  doc["status"] = status;
  doc["isOn"] = lightOn;
  char buf[128];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(ackTopic.c_str(), (const uint8_t *)buf, n, false);
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

  if (cmdTopic.length() > 0 && cmdTopic.equals(topic))
  {
    JsonDocument doc;
    if (deserializeJson(doc, payload, len))
    {
      Serial.println("[cmd] json parse failed");
      return;
    }
    const char *cmdId = doc["cmd_id"] | (const char *)nullptr;
    bool desiredOn = doc["isOn"] | false;
    if (!cmdId)
      return;
    setLight(desiredOn);
    publishAck(String(cmdId), "applied");
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
    Serial.printf("[mqtt] subscribed %s\n", cmdTopic.c_str());
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

void ledStatus()
{
  digitalWrite(LED_BUILTIN, HIGH);
  // Serial.println("[led] off");
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  // Serial.println("[led] on");
  delay(1000);
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

  Serial.println("\n[boot] sensor-registry light");
  Serial.printf("[boot] reset reason: %s\n", ESP.getResetReason().c_str());
  Serial.printf("[boot] free heap: %u\n", ESP.getFreeHeap());

  pinMode(LIGHT_PIN, OUTPUT);
  setLight(false);

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
}

void loop()
{
  // ledStatus();
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
