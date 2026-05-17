# Flow diagrams

Mermaid version ของ flow ทั้งหมดใน [`CLAUDE.md`](../CLAUDE.md) — render บน GitHub, VSCode (Mermaid Preview), Obsidian, mermaid.live

ASCII version (สำหรับ terminal) อยู่ที่ CLAUDE.md ฝั่งนี้คือ visual companion

## 1. Toggle / command lifecycle

```mermaid
sequenceDiagram
  actor U as UI
  participant B as Backend
  participant M as Mosquitto
  participant E as ESP

  U->>B: POST /devices/{id}/toggle
  alt controlMode == 'auto'
    B-->>U: 409 StateError
  else !state.isOnline
    B-->>U: 409 StateError "อุปกรณ์ออฟไลน์"
  else
    B->>B: flip state.isOn + lastUpdatedAt
    B->>B: writeLog 'toggle'
    B-->>U: 200 OK (Device doc)
    B-)U: SSE device_updated (UI flip optimistic)
    B->>M: publish dev/{id}/cmd qos1 {cmd_id, isOn, ts}
    Note over B: setTimeout(ACK_TIMEOUT_MS=5s)
    M->>E: deliver cmd
    E->>E: setLight(isOn)
    E->>M: publish dev/{id}/ack {cmdId, status, isOn}
    M->>B: deliver ack

    alt ack มาภายใน 5s
      B->>B: clear pending timer
      opt wasOffline
        B->>B: flip isOnline=true
        B->>B: log device_online (cmd_ack_after_offline)
      end
      opt payload.isOn != state.isOn
        B->>B: sync state.isOn
        B->>B: log hb_sync
      end
      B->>B: log cmd_ack
      B-)U: SSE device_updated
    else timer ครบไม่มี ack
      B->>B: log cmd_timeout
      opt state.isOnline == true
        B->>B: flip isOnline=false
        B->>B: log device_offline (reason cmd_timeout)
        B-)U: SSE device_updated (UI offline ~5s)
      end
    end
  end
```

## 2. Offline detection — 3 paths

```mermaid
flowchart TD
  A[ESP ดับ/หลุด WiFi/ปลั๊กหลุด] --> B{event ที่เกิดก่อน}

  B -->|user toggle ขณะหลุด| P1["path A — cmd_timeout<br/>~5s ACK_TIMEOUT_MS"]
  B -->|broker เจอ TCP loss| P2["path B — LWT<br/>~60-90s keepalive"]
  B -->|ไม่มี event เลย| P3["path C — stale tick<br/>~90-120s fallback"]

  P1 --> H1["handleCmdTimeout<br/>log cmd_timeout"]
  H1 --> H1b["log device_offline<br/>reason: cmd_timeout"]

  P2 --> H2["handleLwt<br/>(broker auto-publish<br/>dev/{id}/lwt = 'offline' retain)"]
  H2 --> H2b["log device_offline"]

  P3 --> H3["runTick ทุก 30s<br/>reconcileStaleHeartbeats(HEARTBEAT_GRACE_MS)<br/>หา isOnline=true ที่ lastSeenAt &lt; now-grace"]
  H3 --> H3b["handleLwt ของแต่ละ id"]

  H1b --> S["state.isOnline=false<br/>emit device_updated"]
  H2b --> S
  H3b --> S

  S --> R{device กลับมา?}
  R -->|heartbeat มา ทุก 30s| O1["handleHeartbeat<br/>flip isOnline=true<br/>log device_online"]
  R -->|ack ของ cmd เก่า| O2["handleAck<br/>flip isOnline=true<br/>log device_online<br/>reason: cmd_ack_after_offline"]

  style P1 fill:#fee2e2,stroke:#fca5a5
  style P2 fill:#fef3c7,stroke:#fcd34d
  style P3 fill:#dbeafe,stroke:#93c5fd
  style O1 fill:#d1fae5,stroke:#86efac
  style O2 fill:#d1fae5,stroke:#86efac
```

## 3. Pairing (Announce & Claim)

```mermaid
sequenceDiagram
  participant E as ESP
  participant M as Mosquitto
  participant B as Backend
  participant D as Mongo
  actor U as UI

  Note over E: boot → /id.txt ว่าง = pairing mode
  E->>M: subscribe pair/ack/{mac}

  loop ทุก 5s
    E->>M: publish pair/hello {mac, model, fw}
    M->>B: deliver
    B->>D: upsert PairingSession<br/>{mac, proposedId=light-mac6,<br/>lastSeenAt}
    B-)U: SSE pair_announced (badge pulse)
  end

  U->>B: POST /api/pairing/claim {mac, location}
  B->>D: Device.create({_id: light-xxx,<br/>location, state.mac})
  B->>D: DeviceLog.create({type: 'paired'})
  B->>D: PairingSession.deleteOne({mac})
  B-)U: SSE device_updated + pair_claimed<br/>(ลบ card จาก pairing tab)
  B->>M: publish pair/ack/{mac}<br/>{device_id} qos1 retain ★

  M->>E: deliver retained ack
  E->>E: saveLittleFS('/id.txt', device_id)
  E->>E: ESP.restart()

  Note over E: boot รอบ 2 → paired mode
  E->>M: subscribe dev/{id}/cmd
  E->>M: connect with LWT dev/{id}/lwt='offline' retain
  E->>M: publish dev/{id}/hb retain
  M->>B: deliver hb → handleHeartbeat → flip isOnline=true
```

## 4. Heartbeat & drift reconciliation

```mermaid
sequenceDiagram
  participant E as ESP
  participant M as Mosquitto
  participant B as Backend
  participant D as Mongo
  actor U as UI

  loop ทุก 30s (HEARTBEAT_INTERVAL_MS)
    E->>M: publish dev/{id}/hb retain<br/>{isOn, rssi, uptime}
    M->>B: deliver
    B->>D: Device.findById

    alt !doc (firmware ค้าง id ที่ถูกลบ)
      Note over B: drop เงียบๆ
    else
      B->>B: state.isOnline = true<br/>state.lastSeenAt = now

      alt payload.isOn != state.isOn
        B->>B: state.isOn = payload.isOn<br/>state.lastUpdatedAt = now
        Note right of B: drift detected
        B->>D: save + writeLog hb_sync
      else
        B->>D: save
      end

      opt wasOffline
        B->>D: writeLog device_online
      end

      B-)U: SSE device_updated
    end
  end
```

**เคสที่ `hb_sync` ทำงาน:**
- cmd หายระหว่าง MQTT relay (broker bug, QoS mismatch)
- ESP รีบูตเอง (watchdog/brownout) ระหว่าง apply cmd
- Backend optimistic flip แต่ ESP ตอน apply เจอ error (เช่น GPIO ติด)

## 5. Remove device + auto re-pair

```mermaid
sequenceDiagram
  actor U as UI
  participant B as Backend
  participant D as Mongo
  participant M as Mosquitto
  participant E as ESP

  U->>B: DELETE /api/devices/{id}
  B->>D: Device.findById → ดึง state.mac
  alt !doc
    B-->>U: 404 NotFoundError
  else
    B->>D: Device.deleteOne({_id: id})
    B->>D: DeviceLog.deleteMany({deviceId: id})<br/>(archived ไม่ลบ)
    B-)U: SSE device_removed (card หาย)

    par clear retained messages
      B->>M: publish pair/ack/{mac} '' retain
      B->>M: publish dev/{id}/lwt '' retain
      B->>M: publish dev/{id}/hb '' retain
    and trigger ESP re-pair
      B->>M: publish dev/{id}/wipe '1' qos1 (non-retained)
    end

    alt ESP online ตอนลบ
      M->>E: deliver wipe
      E->>E: LittleFS.remove("/id.txt")
      E->>E: ESP.restart()
      Note over E: boot → loadDeviceId() ว่าง<br/>→ pairing mode
      E->>M: publish pair/hello {mac,model,fw}
      M->>B: deliver hello
      B->>D: upsert PairingSession (โผล่บน UI)
    else ESP offline ตอนลบ
      Note over E: ESP รับ wipe ไม่ทัน
      Note over E: ... time passes ...
      E->>M: reconnect + publish dev/{id}/hb<br/>(id ที่ถูกลบ)
      M->>B: deliver hb
      B->>D: findById(id) → null
      Note over B: debounce 60s ต่อ id<br/>กัน log spam
      B->>M: publish dev/{id}/wipe '1' (recovery)
      M->>E: deliver wipe
      E->>E: wipeAndRestart → re-pair
    end
  end
```

**Non-retained wipe ตั้งใจ:** retained จะทำให้ ESP ที่ re-pair กลับมา (ID เดิม เพราะ MAC เดิม) subscribe `dev/{id}/wipe` แล้วได้ retained wipe → wipe ซ้ำ → infinite loop

## 6. Device state machine

```mermaid
stateDiagram-v2
  [*] --> Unpaired: pair/hello

  Unpaired --> OnlineOff: claim + first heartbeat<br/>(default isOn=false)

  state Online {
    OnlineOff --> OnlineOn: toggle on /<br/>auto_on / timer_expire(invalid)
    OnlineOn --> OnlineOff: toggle off /<br/>auto_off / timer_expired
    OnlineOn --> OnlineOn: setMode, setAutoTimes, startOffTimer
    OnlineOff --> OnlineOff: setMode, setAutoTimes
    OnlineOn --> OnlineOn: hb_sync(true)
    OnlineOff --> OnlineOff: hb_sync(false)
    OnlineOn --> OnlineOff: hb_sync(false) — drift correction
    OnlineOff --> OnlineOn: hb_sync(true) — drift correction
  }

  Online --> Offline: LWT / cmd_timeout / stale tick
  Offline --> OnlineOn: heartbeat or ack (isOn=true)
  Offline --> OnlineOff: heartbeat or ack (isOn=false)

  Offline --> Unpaired: removeDevice → wipe → ESP re-pair
  OnlineOn --> Unpaired: removeDevice → wipe → ESP re-pair
  OnlineOff --> Unpaired: removeDevice → wipe → ESP re-pair
  Unpaired --> [*]: PairingSession TTL 3600s<br/>(user ไม่ claim ภายใน 1 ชม.)
```

**ลบไม่ใช่ terminal:** ตั้งแต่เพิ่ม `dev/{id}/wipe` ESP จะวนกลับเข้า `Unpaired` อัตโนมัติ (boot ใหม่ → publish hello) — เปลี่ยน "ลบแล้วต้อง flash ESP เอง" เป็น "ลบแล้วโผล่ pairing tab ทันที"

**ในมุม UI:**
- `Unpaired` → tab **Pairing**, card ลอย + ปุ่ม Claim
- `Online*` → tab **อุปกรณ์ทั้งหมด**, จุดสีเขียว + ปุ่ม toggle ใช้ได้
- `Offline` → tab **อุปกรณ์ทั้งหมด**, badge แดง "ออฟไลน์" + ปุ่ม toggle disable + หลอด dim

## 7. SSE pipeline (โครงสร้าง realtime)

```mermaid
flowchart LR
  subgraph Backend
    direction TB
    SVC["services/devices.ts<br/>services/pairing.ts"]
    BUS["events.ts<br/>(singleton EventEmitter)"]
    CTRL["controllers/events.controller<br/>GET /api/events"]
    SVC -->|emitDeviceUpdated<br/>emitDeviceRemoved<br/>emitPairAnnounced<br/>emitPairClaimed| BUS
    BUS -->|"on('event')"| CTRL
  end

  subgraph Frontend
    direction TB
    API["services/api.ts<br/>subscribeToEvents"]
    STORE["stores/devices.ts<br/>(Pinia)"]
    UI["DeviceCard / DeviceControl /<br/>PairingCard"]
    API -->|onEvent| STORE
    STORE --> UI
  end

  CTRL -->|"text/event-stream<br/>retry: 3000<br/>heartbeat ': ping' 25s"| API

  style BUS fill:#fef3c7,stroke:#fcd34d
  style STORE fill:#dbeafe,stroke:#93c5fd
```
