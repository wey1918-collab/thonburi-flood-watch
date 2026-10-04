import LiveDashboard from "@/components/LiveDashboard";

export default function Home() {
  return (
    <main className="page-shell">
      <LiveDashboard />
      <footer>
        Community dashboard • BMA DDS + TMD + RID C.29 + Hydrographic Department tide prediction • ควรตรวจประกาศทางการประกอบก่อนตัดสินใจด้านความปลอดภัย
      </footer>
    </main>
  );
}
