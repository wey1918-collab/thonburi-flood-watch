import LiveDashboard from "@/components/LiveDashboard";

export default function Home() {
  return (
    <main className="page-shell">
      <LiveDashboard />
      <footer>
        Community flood dashboard • BMA DDS + ThaiWater/สสน. + TMD + RID C.29 + GISTDA + Hydrographic Department tide prediction • ใช้เพื่อเฝ้าระวังและควรตรวจประกาศทางการก่อนตัดสินใจด้านความปลอดภัย
      </footer>
    </main>
  );
}
