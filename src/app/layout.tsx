import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thonburi Flood Watch",
  description: "ต้นแบบแดชบอร์ดเฝ้าระวังน้ำท่วมบางกอกน้อยและฝั่งธนบุรี",
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
