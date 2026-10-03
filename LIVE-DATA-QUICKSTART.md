# Thonburi Flood Watch V0.3 — Live Data Quickstart

## Data flow

```text
BMA Rain / Water / Road Flood ─┐
TMD Daily Forecast ────────────┤
RID C.29 runoff report ────────┼─> /api/overview/live -> Dashboard
Bangkok Port Tide Prediction ──┘
```

## 1) BMA DDS

- Rain: https://weather.bangkok.go.th/rain
- Water: https://weather.bangkok.go.th/Water/
- Road flood: https://weather.bangkok.go.th/floodbangkok

ดึงฝั่ง Server และ cache เพื่อลดโหลดต้นทาง

## 2) TMD Forecast

Adapter จะลองหน้าพยากรณ์ประจำวันที่ออกช่วงเช้า/กลางวันของวันปัจจุบันก่อน แล้ว fallback ไปหน้า latest:

- https://www.tmd.go.th/forecast/daily

ดึงเฉพาะส่วน `กรุงเทพและปริมณฑล` ได้แก่โอกาสฝน, ข้อความฝนตกหนัก, ลมกระโชกแรง และอุณหภูมิ

> TMD มี API แบบลงทะเบียนด้วย แต่ V0.3 เลือกอ่านหน้าเผยแพร่สาธารณะเพื่อให้ Starter ใช้งานได้โดยยังไม่ต้องมี API key

## 3) RID C.29

Primary discovery:

- https://www.rid.go.th/th/water-situation

Adapter พยายามค้นหารายงานล่าสุด แล้วอ่านค่า `(C.29) อ.บางไทร` ของวันนี้/เมื่อวานเพื่อสร้าง trend

Fallback สำหรับกรณีหน้า listing เปลี่ยนโครงสร้าง:

```env
RID_RUNOFF_REPORT_URL=https://www.rid.go.th/th/water-situation/<report-id>
```

หากรายงานเก่ากว่า 36 ชั่วโมง Dashboard จะติดป้ายว่าข้อมูลเก่า แทนการถือว่าเป็นข้อมูลปัจจุบัน

## 4) Tide prediction — Bangkok Port

แหล่งทางการ:

- https://hydro.navy.mi.th/waterlaveltable
- PDF MSL 2026: https://hydro.navy.mi.th/storage/frontend/article/22987/file/th/BH2026msl.pdf

V0.3 ฝัง **ตารางเดือนตุลาคม 2569** จาก PDF ทางการไว้ใน code เพื่อไม่ต้อง parse PDF ทุก request

ข้อมูลนี้คือ **prediction** รายชั่วโมง หน่วยเมตรเหนือ Mean Sea Level (MSL) ไม่ใช่ค่าตรวจวัดสด

นอกเดือนตุลาคม 2569 Starter จะคืน `unavailable` แทนการเดาค่า

## API

### `GET /api/overview/live`

Response หลัก:

```json
{
  "ok": true,
  "generatedAt": "...",
  "bma": { "rain": [], "water": [], "roadFlood": [] },
  "tmd": { "rainChancePercent": 40, "heavyRain": true },
  "ridC29": { "flowM3s": 2382, "previousFlowM3s": 2113, "trend": "RISING" },
  "tide": { "isPrediction": true, "nextHigh": { "levelMslM": 1.1 } },
  "errors": []
}
```

## Deploy Vercel

1. Push โฟลเดอร์นี้ขึ้น GitHub
2. Import repo ใน Vercel
3. Deploy
4. ปกติไม่ต้องมี API key สำหรับ source ที่ V0.3 ใช้
5. ถ้า RID auto-discovery ใช้ไม่ได้ ให้ตั้ง `RID_RUNOFF_REPORT_URL`

## ข้อจำกัด

- BMA/TMD/RID adapters อ่าน public HTML จึงอาจต้องแก้ parser เมื่อหน่วยงานเปลี่ยนหน้าเว็บ
- Tide ใน V0.3 ครอบคลุมเฉพาะ October 2026
- อย่าใช้ Dashboard นี้เป็นแหล่งเดียวในการตัดสินใจด้านความปลอดภัยหรือการอพยพ
- Overall badge ใช้สถานะ BMA sensor เท่านั้น ไม่ได้สร้าง risk score จาก TMD/RID/Tide โดยพลการ
