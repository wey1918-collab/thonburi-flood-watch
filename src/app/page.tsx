import LiveDashboardV08 from "@/components/LiveDashboardV08";
import TmdRainRadarDashboard from "@/components/TmdRainRadarDashboard";

export default function Home() {
  return (
    <main className="page-shell">
      <section className="v08-section" aria-label="สถานะและข้อจำกัดของเว็บไซต์">
        <div className="v08-section-head">
          <div>
            <span className="section-kicker">PUBLIC BETA • INDEPENDENT COMMUNITY DASHBOARD</span>
            <h2>เว็บไซต์อิสระเพื่อข้อมูลและการเฝ้าระวัง</h2>
          </div>
          <span className="live-chip">PUBLIC BETA</span>
        </div>
        <p>
          Thonburi Flood Watch รวบรวมและสรุปข้อมูลฝน ระดับน้ำ น้ำท่วมถนน และบริบทที่เกี่ยวข้อง
          เพื่อช่วยให้ประชาชนฝั่งธนบุรีและพื้นที่เชื่อมต่อมองสถานการณ์ได้ง่ายขึ้น เว็บไซต์นี้ไม่ใช่เว็บไซต์
          หรือระบบเตือนภัยอย่างเป็นทางการของกรุงเทพมหานครหรือหน่วยงานราชการใด
        </p>
        <p className="v08-threshold-note">
          ⚠️ ข้อมูลอาจล่าช้า ขาดหาย หรือแตกต่างจากสถานการณ์จริง โดยเฉพาะเมื่อแหล่งข้อมูลต้นทางขัดข้อง
          หรือระบบใช้ข้อมูล fallback/สถานีใกล้เคียง โปรดตรวจสอบประกาศจากหน่วยงานราชการและสภาพพื้นที่จริง
          ก่อนตัดสินใจด้านความปลอดภัย การเดินทาง หรือการอพยพในเหตุฉุกเฉิน
        </p>
      </section>

      <LiveDashboardV08 />
      <TmdRainRadarDashboard />

      <details className="detail-disclosure v08-details">
        <summary><span>เกี่ยวกับโครงการและการใช้ข้อมูล</span><small>PUBLIC BETA</small></summary>
        <div className="road-list compact-road-list">
          <div className="road-row"><div><strong>วัตถุประสงค์</strong><span>Community dashboard สำหรับเฝ้าระวังฝน น้ำ และน้ำท่วม โดยเน้นฝั่งธนบุรีเป็นหลัก</span></div></div>
          <div className="road-row"><div><strong>แหล่งข้อมูล</strong><span>BMA, ThaiWater/สสน., TMD, RID, GISTDA และข้อมูลน้ำขึ้นน้ำลงจากหน่วยงานที่เกี่ยวข้อง ตามแหล่งที่ระบบสามารถเข้าถึงได้ในขณะนั้น</span></div></div>
          <div className="road-row"><div><strong>การประมวลผล</strong><span>เว็บไซต์อาจรวมข้อมูลหลายแหล่ง ใช้สถานีใกล้เคียงเมื่อข้อมูลตรงพื้นที่ไม่พร้อม และแสดงเกณฑ์สรุปบางส่วนเพื่อให้อ่านง่าย โดยจะระบุสถานะ LIVE, FALLBACK, STALE หรือ OFFLINE ตามที่ระบบตรวจได้</span></div></div>
          <div className="road-row"><div><strong>ข้อจำกัด</strong><span>ค่าบางรายการเป็นค่าจากสถานีวัดหรือระดับอ้างอิง เช่น m MSL ไม่ใช่ความลึกของน้ำบนถนน และไม่ควรตีความเป็นคำสั่งหรือประกาศเตือนภัยของรัฐ</span></div></div>
          <div className="road-row"><div><strong>สิทธิในข้อมูล</strong><span>ข้อมูล ชื่อหน่วยงาน และบริการต้นทางยังคงเป็นสิทธิของเจ้าของข้อมูลแต่ละราย เว็บไซต์นี้ไม่ได้อ้างว่าได้รับการรับรอง สนับสนุน หรือดำเนินการโดยหน่วยงานดังกล่าว</span></div></div>
        </div>
      </details>

      <footer>
        Thonburi Flood Watch • PUBLIC BETA • Community dashboard • แหล่งข้อมูลที่ระบบเชื่อมต่อ: BMA DDS + ThaiWater/สสน. + TMD Forecast/AWS/Radar/Nowcast + RID + GISTDA + Hydrographic tide prediction • เน้นบางกอกน้อย ธนบุรี บางกอกใหญ่ ตลิ่งชัน บางพลัด และแนวเชื่อมบางกรวย • ไม่ใช่ระบบเตือนภัยทางการ • โปรดตรวจประกาศจากหน่วยงานรัฐและสถานการณ์จริงประกอบก่อนตัดสินใจด้านความปลอดภัย
      </footer>
    </main>
  );
}
