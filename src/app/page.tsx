import LiveDashboardV08 from "@/components/LiveDashboardV08";
import TmdRainRadarDashboard from "@/components/TmdRainRadarDashboard";

export default function Home() {
  return (
    <main className="page-shell">
      <LiveDashboardV08 />
      <TmdRainRadarDashboard />
      <footer>
        Community dashboard • BMA DDS + ThaiWater/สสน. + TMD Forecast/AWS/Radar/Nowcast + RID + GISTDA + Hydrographic tide prediction • Road Monitor 5 ระดับ: จรัญสนิทวงศ์, บางกรวย-ไทรน้อย, ราชพฤกษ์, อิสรภาพ, บรมราชชนนี • ควรตรวจประกาศทางการประกอบก่อนตัดสินใจด้านความปลอดภัย
      </footer>
    </main>
  );
}
