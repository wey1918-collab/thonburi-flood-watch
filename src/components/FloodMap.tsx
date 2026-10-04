"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { FloodMapPoint } from "@/lib/map-points";

const statusColor: Record<string, string> = {
  NORMAL: "#52d273",
  WATCH: "#f6c344",
  WARNING: "#ff914d",
  CRITICAL: "#ff5d68",
  OFFLINE: "#7f8b99",
  UNKNOWN: "#9db0c6",
};

const statusLabel: Record<string, string> = {
  NORMAL: "ปกติ",
  WATCH: "เฝ้าระวัง",
  WARNING: "เตือนภัย",
  CRITICAL: "วิกฤต",
  OFFLINE: "ขัดข้อง/ออฟไลน์",
  UNKNOWN: "ไม่ทราบสถานะ",
};

const kindLabel: Record<string, string> = {
  RAIN: "ฝน",
  WATER: "ระดับน้ำ",
  ROAD_FLOOD: "ถนน",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function FloodMap({ points }: { points: FloodMapPoint[] }) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      center: [100.481, 13.748],
      zoom: 12.4,
      minZoom: 10,
      maxZoom: 18,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const point of points) {
      const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(`
        <div class="map-popup">
          <strong>${escapeHtml(point.name)}</strong>
          <span>${escapeHtml(point.subtitle)}</span>
          <div class="map-popup-kind">${escapeHtml(kindLabel[point.kind])}</div>
          <div class="map-popup-value">${escapeHtml(point.value)}</div>
          <div class="map-popup-status">${escapeHtml(statusLabel[point.status] ?? point.status)}</div>
          <small>${escapeHtml(point.note)}</small>
        </div>
      `);

      const marker = new maplibregl.Marker({ color: statusColor[point.status] ?? statusColor.UNKNOWN })
        .setLngLat([point.longitude, point.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [points]);

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="live-map" aria-label="แผนที่สถานีจริง BMA DDS บางกอกน้อยและฝั่งธนบุรี" />
      <div className="map-legend" aria-label="คำอธิบายสีสถานะ">
        <span><i className="dot normal" />ปกติ</span>
        <span><i className="dot watch" />เฝ้าระวัง</span>
        <span><i className="dot warning" />เตือนภัย</span>
        <span><i className="dot critical" />วิกฤต</span>
        <span><i className="dot offline" />ขัดข้อง</span>
      </div>
    </div>
  );
}
