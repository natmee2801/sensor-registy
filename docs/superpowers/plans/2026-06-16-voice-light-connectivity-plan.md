# แผนการเชื่อมต่อหลอดไฟสั่งการด้วยเสียง — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างเอกสารประกอบรายงานไทยที่อธิบายแผนการเชื่อมต่อ IoT ของ path คำสั่งเสียง พร้อมรูป 2 รูป และผูก reference จากบทที่ 3

**Architecture:** เอกสาร markdown เดี่ยว เล่าตาม path เสียง end-to-end (5 ช่วง) + รูป SVG 2 รูป render เป็น PNG ตาม workflow รูปประกอบเดิมของโปรเจค (Edge headless, 2x). ทุกพารามิเตอร์ต้องตรงกับ source จริง (VOICE.md, WIRING.md, main.cpp, CLAUDE.md)

**Tech Stack:** Markdown ภาษาไทย, SVG (hand-authored), Microsoft Edge headless screenshot สำหรับ render PNG

> **หมายเหตุ TDD:** งานนี้ไม่มี unit test — "การทดสอบ" คือ (1) ตรวจพารามิเตอร์ทุกตัวกับ source file จริง ก่อนเขียน และ (2) render SVG→PNG สำเร็จ (ไฟล์มีอยู่จริง ขนาด > 0). ทำทีละ task แล้ว verify ก่อนไปต่อ

---

## File Structure

- Create: `docs/report/แผนการเชื่อมต่อ-หลอดไฟสั่งการด้วยเสียง.md` — เอกสารหลัก 5 หัวข้อ
- Create: `docs/report/figures/figure-voice-overview.svg` — รูปบล็อกภาพรวม
- Create: `docs/report/figures/figure-voice-overview.png` — render จาก SVG (2x)
- Create: `docs/report/figures/figure-voice-sequence.svg` — รูป sequence คำสั่งเสียง
- Create: `docs/report/figures/figure-voice-sequence.png` — render จาก SVG (2x)
- Modify: `docs/report/บทที่3-วิธีดำเนินโครงงาน.md` — เพิ่ม reference 1 บรรทัด

---

## Task 1: รวบรวมและยืนยันพารามิเตอร์การเชื่อมต่อจาก source จริง

**Files:**
- อ่าน (ไม่แก้): `microcontroller/automate_nodemcu_light/VOICE.md`, `microcontroller/automate_nodemcu_light/WIRING.md`, `microcontroller/automate_nodemcu_light/src/main.cpp`, `CLAUDE.md`

- [ ] **Step 1: อ่าน source ทั้ง 4 ไฟล์ และจดพารามิเตอร์ลงตารางชั่วคราว**

ตรวจและจดค่าจริงของแต่ละช่วง:
- ① เสียง→VC-02: โมเดลออฟไลน์, wake word "hey pudding" (0x00), คำสั่งไฟ 6 แบบ (0x27–0x2c) — ยืนยันจาก VOICE.md §2
- ② VC-02→ESP: UART `SoftwareSerial`, baud 115200 8N1, pin RX=D7(GPIO13)/TX=D5(GPIO14), cross-wire, packet `[0x5a, cmd, 0x00, 0x00, checksum]`, checksum=`(0x5a+cmd)&0xff` — ยืนยันจาก VOICE.md §1–2 + main.cpp parser
- ③ ESP→Broker: WiFi 2.4GHz (ESP8266 ไม่รองรับ 5GHz), MQTT พอร์ต 1883 — ยืนยันจาก CLAUDE.md
- ④ Broker→Backend: topic `dev/{id}/hb` QoS0 retained, wildcard `dev/+/hb` — ยืนยันจาก CLAUDE.md MQTT topology
- ⑤ Backend→UI: SSE `text/event-stream`, event `device_updated`, log `hb_sync` — ยืนยันจาก CLAUDE.md

- [ ] **Step 2: ยืนยัน pin GPIO ใน main.cpp ตรงกับ VOICE.md**

Run (Grep): ค้น `SoftwareSerial`, `D5`, `D7`, `GPIO`, `5a` ใน `main.cpp`
Expected: ค่า pin/baud/packet ตรงกับที่ VOICE.md ระบุ — ถ้าไม่ตรง ใช้ค่าจาก main.cpp (source of truth) และบันทึกความต่าง

- [ ] **Step 3: ไม่มี commit** (task รวบรวมข้อมูลล้วน — ผู้ใช้สั่งไม่ commit)

---

## Task 2: เขียนเอกสารหลัก (โครงครบ ยังไม่ฝังรูป)

**Files:**
- Create: `docs/report/แผนการเชื่อมต่อ-หลอดไฟสั่งการด้วยเสียง.md`

- [ ] **Step 1: เขียนหัวเอกสาร + หัวข้อ 1 (ภาพรวม)**

เนื้อหา:
- ชื่อเอกสาร + 1 ย่อหน้าเกริ่นว่าเป็นเอกสารประกอบบทที่ 3 อธิบาย path คำสั่งเสียง
- หัวข้อ "1. ภาพรวมการเชื่อมต่อ": 1 ย่อหน้าเล่าเส้นทางคำสั่งเสียง 1 คำ + ASCII block diagram ชั่วคราว (placeholder ตำแหน่งรูปที่ 1 ใส่ comment `<!-- ![รูปที่ 1](figures/figure-voice-overview.png) -->` ไว้ก่อน รอ Task 4)

ASCII ภาพรวมที่ใช้:
```
🎤 เสียง → [VC-02] → UART → [ESP8266] → WiFi → [Mosquitto] → [Backend] → SSE → [หน้าเว็บ]
            รู้จำเสียง         สั่งรีเลย์        broker        ตัดสิน+บันทึก       เห็นผล
```

- [ ] **Step 2: เขียนหัวข้อ 2 (ไล่ทีละช่วง 5 ช่วง)**

ตารางหลักช่วงการเชื่อมต่อ (ค่าจาก Task 1):

| ช่วง | เชื่อม | วิธี/พารามิเตอร์ |
|---|---|---|
| ① เสียง → VC-02 | คนพูด → โมดูลรู้จำเสียง | ออฟไลน์ ไม่ต่อเน็ต, ตื่นด้วย "hey pudding", คำสั่งไฟ 6 แบบ |
| ② VC-02 → ESP8266 | สาย UART | SoftwareSerial 115200 8N1, RX=D7 / TX=D5, cross-wire TX↔RX, packet 5 ไบต์ `[0x5a, cmd, 0x00, 0x00, checksum]` |
| ③ ESP8266 → Broker | WiFi → LAN | WiFi 2.4GHz, TCP/IP, MQTT พอร์ต 1883 |
| ④ Broker → Backend | MQTT pub/sub | ESP publish `dev/{id}/hb` (QoS0, retained) หลัง flip รีเลย์ → backend subscribe wildcard `dev/+/hb` |
| ⑤ Backend → หน้าเว็บ | SSE | บันทึก DB + log `hb_sync` + broadcast `device_updated` ผ่าน `text/event-stream` |

ตามด้วยคำอธิบายช่วงละ 3–5 บรรทัดใต้ตาราง (ขยายความแต่ละช่วง)

- [ ] **Step 3: เขียนหัวข้อ 3 (ลำดับเหตุการณ์) + หัวข้อ 4 (ตารางสรุป) + หัวข้อ 5 (หมายเหตุ)**

- หัวข้อ 3: 1 ย่อหน้าอธิบาย flow + placeholder comment รูปที่ 2 + ย่อหน้าอธิบายว่าทำไม path เสียงใช้ heartbeat/`hb_sync` แทน `dev/{id}/cmd` (ไม่มี `cmd_id`)
- หัวข้อ 4: ตารางสรุปคอลัมน์ = ช่วง / ชนิดการเชื่อมต่อ / ระยะโดยประมาณ / โปรโตคอล / ทิศทางข้อมูล
- หัวข้อ 5: 3 bullet (stateless ESP, ออฟไลน์/ความเป็นส่วนตัว, single source of truth)

- [ ] **Step 4: ตรวจภาษา/สไตล์**

อ่านทวน: ภาษาไทยสไตล์เดียวกับบทที่ 3, ชื่อเทคนิคคงภาษาอังกฤษ (VC-02, MQTT, SSE, heartbeat, hb_sync), ไม่มี placeholder ค้างนอกจาก comment รูป
Expected: เนื้อหา 5 หัวข้อครบ อ่านรู้เรื่องโดยไม่เปิดโค้ด

- [ ] **Step 5: ไม่ commit** (ผู้ใช้สั่งไม่ commit — เก็บใน working tree)

---

## Task 3: สร้างไฟล์ SVG 2 รูป

**Files:**
- Create: `docs/report/figures/figure-voice-overview.svg`
- Create: `docs/report/figures/figure-voice-sequence.svg`

- [ ] **Step 1: ตรวจสไตล์อ้างอิงจาก figure เดิม (ถ้ามี)**

Run (Glob): `docs/report/figures/*.svg`
Expected: ถ้ามี figure-3.2 / figure-3.3 ให้เปิดดู palette + `<symbol>` icon + font เพื่อ reuse สไตล์. ถ้าไม่มีไฟล์ SVG (เคยถูกลบ) ใช้ palette จาก `docs/flows.md` (slate/blue/emerald/amber + violet/cyan) และ font ไทยที่ render ได้

- [ ] **Step 2: เขียน `figure-voice-overview.svg`**

บล็อกแนวนอน 5–6 กล่อง: เสียง → VC-02 → ESP8266 → Mosquitto → Backend → หน้าเว็บ
ป้ายเส้นเชื่อม: UART / WiFi+MQTT / SSE. caption ในรูป "รูปที่ 1 ภาพรวมการเชื่อมต่อคำสั่งเสียง"
กำหนด `width`/`height` ชัดเจน (เช่น 960x360) สำหรับ `--window-size`

- [ ] **Step 3: เขียน `figure-voice-sequence.svg`**

sequence 4 lifeline: VC-02 / ESP8266 / Backend / หน้าเว็บ (ย่อจาก VOICE.md §4)
ลูกศร: voice cmd → UART packet → publish hb → hb_sync+emit → SSE update
caption ในรูป "รูปที่ 2 ลำดับเหตุการณ์ของคำสั่งเสียง". กำหนด width/height ชัดเจน

- [ ] **Step 4: ไม่ commit**

---

## Task 4: Render SVG → PNG และฝังในเอกสาร

**Files:**
- Create: `docs/report/figures/figure-voice-overview.png`
- Create: `docs/report/figures/figure-voice-sequence.png`
- Modify: `docs/report/แผนการเชื่อมต่อ-หลอดไฟสั่งการด้วยเสียง.md` (เปิด comment รูปเป็น `![...]` จริง)

- [ ] **Step 1: render รูปที่ 1**

Run (PowerShell, ใช้ user-data-dir ใหม่ทุกครั้ง — ดู memory project-report-figures):
```
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --no-sandbox --user-data-dir="$env:TEMP\edge-voice-ov" --hide-scrollbars --force-device-scale-factor=2 --window-size=960,360 --screenshot="<abs>\figures\figure-voice-overview.png" "file:///<abs>/figures/figure-voice-overview.svg"
```
(แทน `<abs>` ด้วย path เต็มของ `docs/report`, `--window-size` ต้องเท่า width/height ของ SVG)
Expected: ไฟล์ PNG ถูกสร้าง

- [ ] **Step 2: verify PNG รูปที่ 1 มีอยู่จริงและ > 0 ไบต์**

Run (PowerShell): `Get-Item "<abs>\figures\figure-voice-overview.png" | Select-Object Length`
Expected: Length > 0 (ถ้า MISSING — ใช้ user-data-dir ใหม่ที่ไม่ซ้ำแล้ว render ใหม่)

- [ ] **Step 3: render + verify รูปที่ 2** (ทำซ้ำ Step 1–2 กับ `figure-voice-sequence`, user-data-dir `$env:TEMP\edge-voice-seq`, --window-size ตรงกับ SVG)

Expected: PNG รูปที่ 2 มีอยู่จริง > 0 ไบต์

- [ ] **Step 4: เปิด comment รูปในเอกสารหลักเป็นการฝังจริง**

แก้ `<!-- ![รูปที่ 1](figures/figure-voice-overview.png) -->` → `![รูปที่ 1 ภาพรวมการเชื่อมต่อคำสั่งเสียง](figures/figure-voice-overview.png)` และทำนองเดียวกับรูปที่ 2

- [ ] **Step 5: ไม่ commit**

---

## Task 5: ผูก reference จากบทที่ 3

**Files:**
- Modify: `docs/report/บทที่3-วิธีดำเนินโครงงาน.md`

- [ ] **Step 1: เพิ่ม reference 1 บรรทัด**

เพิ่มหมายเหตุท้าย §3.3 หรือ §3.4 (จุดที่กล่าวถึงการสั่งด้วยเสียง) เช่น:
```
> **ดูเพิ่มเติม:** รายละเอียดเส้นทางการเชื่อมต่อของคำสั่งเสียงตั้งแต่ผู้ใช้พูดจนเห็นผลบนหน้าเว็บ
> ดูที่เอกสาร [แผนการเชื่อมต่อหลอดไฟสั่งการด้วยเสียง](./แผนการเชื่อมต่อ-หลอดไฟสั่งการด้วยเสียง.md)
```

- [ ] **Step 2: verify ลิงก์ relative path ถูกต้อง**

Run (Glob): ยืนยันไฟล์ `docs/report/แผนการเชื่อมต่อ-หลอดไฟสั่งการด้วยเสียง.md` มีอยู่
Expected: path ใน link ตรงกับไฟล์จริง

- [ ] **Step 3: ไม่ commit**

---

## Verification (ทำหลังครบทุก task)

- [ ] เอกสารหลักมี 5 หัวข้อครบ + ฝังรูป 2 รูป (ไม่เหลือ comment placeholder)
- [ ] PNG ทั้ง 2 ไฟล์มีอยู่จริง ขนาด > 0
- [ ] พารามิเตอร์ทุกตัวตรงกับ source (สุ่มตรวจ baud 115200, pin D5/D7, topic `dev/{id}/hb`, QoS0)
- [ ] บทที่ 3 มี reference ชี้มาที่เอกสารใหม่ ลิงก์ถูก
- [ ] ภาษาไทยสไตล์เดียวกับบทที่ 3
- [ ] ไม่มีการ commit (ตามที่ผู้ใช้สั่ง) — งานทั้งหมดอยู่ใน working tree

---

## หมายเหตุข้อจำกัด

- หากเครื่องไม่มี Microsoft Edge ที่ path มาตรฐาน → render ไม่ได้ ให้แจ้งผู้ใช้และเสนอ
  ทางเลือก (ใช้ Chrome headless แทน หรือส่ง SVG ให้ผู้ใช้ render เอง) ไม่เดา path
- ถ้าพารามิเตอร์ใน source ขัดกันเอง → ยึด `main.cpp` เป็น source of truth แล้วบันทึกความต่าง
