import type { Severity } from "@/lib/bma/types";

export default function StatusBadge({ status }: { status: Severity }) {
  const text: Record<Severity, string> = {
    NORMAL: "ปกติ",
    WATCH: "เฝ้าระวัง",
    WARNING: "เตือนภัย",
    CRITICAL: "วิกฤต",
    OFFLINE: "ข้อมูลขัดข้อง",
    UNKNOWN: "กำลังตรวจข้อมูล",
  };

  return <span className={`status-badge status-${status.toLowerCase()}`}>{text[status]}</span>;
}
