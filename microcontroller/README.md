# microcontroller

Placeholder for firmware that will run on the actual lighting devices
(ESP8266 / ESP32 / Arduino). The current `application/` stack is a
simulation only — once real hardware is added, firmware sources, build
configs (PlatformIO / Arduino IDE), and any pin-mapping documentation
go here.

Future integration paths under consideration:
- HTTP polling against `application/backend` REST endpoints
- MQTT broker (Mosquitto) added to the root `docker-compose.yml`
