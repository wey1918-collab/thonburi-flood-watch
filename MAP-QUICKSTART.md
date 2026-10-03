# Map Quickstart — Thonburi Flood Watch

เวอร์ชันนี้เพิ่มแผนที่จริงด้วย **MapLibre GL JS + OpenStreetMap** แล้ว

## รันบนคอมพิวเตอร์

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

## จุดที่แสดงใน Prototype

- ถนนจรัญสนิทวงศ์
- พรานนก
- ถนนอิสรภาพ
- คลองมอญ
- ริมแม่น้ำเจ้าพระยา–ศิริราช

> หมุดชุดแรกเป็นพิกัดระดับพื้นที่/แลนด์มาร์กสำหรับทดสอบ UI ไม่ใช่พิกัดสถานี telemetry ทางการ

## ไฟล์สำคัญ

- `src/components/FloodMap.tsx` — ตัวแผนที่ MapLibre
- `src/lib/map-points.ts` — จุดและสถานะตัวอย่าง
- `src/app/page.tsx` — หน้า Dashboard
- `src/app/globals.css` — รูปแบบแผนที่/Popup/Legend

## ก่อนใช้ Production

OpenStreetMap Standard tile server เหมาะกับการพัฒนาและการใช้งานเบื้องต้น แต่ระบบ Production ที่มีผู้ใช้จำนวนมากควรใช้ tile provider ที่รองรับปริมาณ traffic และปฏิบัติตามนโยบายการใช้งานของผู้ให้บริการ

ขั้นต่อไปคือเปลี่ยน `map-points.ts` จาก Mock/landmark points เป็นพิกัดสถานีจริงจาก BMA DDS / ThaiWater และให้ marker เปลี่ยนสถานะจากข้อมูล API อัตโนมัติ
