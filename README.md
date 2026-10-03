# Thonburi Flood Watch — Multi-source Live Starter V0.3

Next.js mobile-first flood dashboard สำหรับบางกอกน้อยและฝั่งธนบุรี

## V0.3 เพิ่มอะไร

- **BMA DDS**: ฝน, ระดับน้ำคลอง, น้ำท่วมถนน (near real-time)
- **TMD**: พยากรณ์กรุงเทพและปริมณฑลจากหน้าพยากรณ์ประจำวันของกรมอุตุนิยมวิทยา
- **RID C.29**: ปริมาณน้ำไหลผ่านบางไทรจากรายงานสภาพน้ำท่าของกรมชลประทาน
- **Hydrographic Department**: ตารางน้ำขึ้น-ลง Bangkok Port แบบรายชั่วโมง (Prediction, MSL)
- API รวม: `/api/overview/live`
- แยกคำว่า live/near-real-time ออกจาก prediction ชัดเจน
- ไม่มี mock fallback เมื่อ source ล่ม

## Run

```bash
npm install
npm run dev
```

เปิด http://localhost:3000

ตรวจ JSON รวมได้ที่ http://localhost:3000/api/overview/live

อ่าน `LIVE-DATA-QUICKSTART.md` ก่อน Deploy
