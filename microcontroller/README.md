# microcontroller

ESP8266/ESP32 firmware ที่คุยกับ `application/backend` ผ่าน MQTT — backend เป็น
single source of truth, firmware เป็นเพียง executor + reporter

## `automate_nodemcu_light/` (NodeMCU v2 / ESP8266)

ควบคุม LED (built-in GPIO2) ผ่าน MQTT. Topic plan ดู `CLAUDE.md` หรือ
`application/backend/src/services/mqtt.ts`

### Setup

1. ติดตั้ง [PlatformIO](https://platformio.org/) (CLI หรือ VS Code extension)
2. รัน MQTT broker:
   ```sh
   docker compose up -d mosquitto
   ```
3. ตั้ง MQTT broker — เลือกอันใดอันหนึ่ง:
   - **แนะนำ:** ก็อปไฟล์ config แล้วแก้ IP:
     ```sh
     cp src/secrets.h.example src/secrets.h
     ```
     แก้ `MQTT_HOST` เป็น IP ของเครื่องที่รัน docker บน LAN (ไม่ใช่
     `localhost` เพราะ ESP คุยมาจากนอกเครื่อง)
   - หรือไม่ทำอะไรเลย — firmware จะ fallback ไป `192.168.1.100:1883`
4. Flash:
   ```sh
   pio run -t upload
   pio device monitor
   ```

### First-boot flow

1. ESP บูทขึ้นมาเป็น AP ชื่อ `light-setup-XXXX` (WiFiManager)
2. เปิดมือถือ → ต่อ AP → captive portal เด้ง → กรอก WiFi ของบ้าน → save
3. ESP reboot → connect WiFi → publish `pair/hello` ทุก 5 วินาที
4. เปิดแอป frontend → tab **Pairing** → เห็นอุปกรณ์โผล่ → กด **Claim** → ใส่ location
5. ESP รับ `pair/ack/{mac}` (retained) → เขียน device_id ลง LittleFS → reboot →
   เข้าโหมด paired: subscribe `dev/{id}/cmd`, ส่ง heartbeat ทุก 30s, ตั้ง LWT
   `dev/{id}/lwt = "offline"` (broker auto-publish ตอน disconnect)

### Reset / re-pair

ตอนนี้ยังไม่มีปุ่ม reset — ถ้าอยากให้ ESP กลับเข้า pairing mode ต้อง erase
flash:

```sh
pio run -t erase
pio run -t upload
```
