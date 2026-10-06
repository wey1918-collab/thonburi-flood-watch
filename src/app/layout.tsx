import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./dashboard-v08.css";

export const metadata: Metadata = {
  title: "Thonburi Flood Watch — Public Beta",
  description: "แดชบอร์ดอิสระเพื่อเฝ้าระวังน้ำท่วมบางกอกน้อย ฝั่งธนบุรี และแนวเชื่อมบางกรวย โดยรวบรวมข้อมูลจากหลายแหล่ง ไม่ใช่ระบบเตือนภัยทางการ",
  applicationName: "Thonburi Flood Watch",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
