import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { SHIPMENTS, CARRIER_PERF, formatNumber, formatPct } from "@/lib/ops-data";

export const Route = createFileRoute("/logistics")({
  head: () => ({
    meta: [
      { title: "Logistics — Nusantara Seller Operations" },
      { name: "description", content: "Lane monitoring with ETA drift and SLA classification per shipment." },
    ],
  }),
  component: LogisticsPage,
});

// ── Client-only wrapper (Leaflet needs window) ───────────────────────────────
function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted ? <>{children}</> : <>{fallback ?? null}</>;
}

// ── Shipment lane data (real lon/lat waypoints) ──────────────────────────────
// Sea routes follow approximate shipping channel; road routes follow highway

export const LANE_DETAIL: {
  id: string;
  name: string;
  color: string;
  weight: number;
  dashArray?: string;
  mode: string;
  waypoints: [number, number][];  // [lat, lng] for Leaflet
  carrier: string;
  units: number;
  eta: string;
  sla: string;
  note: string;
}[] = [
  {
    id: "SH-7712",
    name: "Semarang → Makassar",
    color: "#dc2626",
    weight: 3,
    dashArray: "8 5",
    mode: "Sea",
    carrier: "Pelni Cargo",
    units: 480,
    eta: "+22h drift",
    sla: "Critical",
    note: "Port weather advisory active — Selat Makassar Sev-3",
    waypoints: [
      [-6.966, 110.421],  // Semarang
      [-5.600, 112.800],  // Java Sea crossing
      [-4.100, 115.500],  // Makassar Strait entry
      [-5.148, 119.432],  // Makassar
    ],
  },
  {
    id: "SH-7718",
    name: "Jakarta → Denpasar",
    color: "#16a34a",
    weight: 2.5,
    mode: "Road",
    carrier: "Wahana Express",
    units: 1800,
    eta: "On time",
    sla: "Standard",
    note: "Via Pantura — Tol Trans-Jawa. ETA on schedule.",
    waypoints: [
      [-6.208, 106.845],  // Jakarta
      [-6.900, 108.700],  // Cirebon area
      [-6.966, 110.421],  // Semarang
      [-7.248, 112.752],  // Surabaya
      [-8.199, 114.363],  // Banyuwangi (ferry crossing)
      [-8.650, 115.212],  // Denpasar
    ],
  },
  {
    id: "SH-7723",
    name: "Surabaya → Banjarmasin",
    color: "#d97706",
    weight: 2.5,
    dashArray: "6 4",
    mode: "Sea",
    carrier: "Pelni Cargo",
    units: 940,
    eta: "+4h drift",
    sla: "Standard",
    note: "Minor congestion at Tanjung Perak port exit.",
    waypoints: [
      [-7.248, 112.752],  // Surabaya
      [-5.800, 113.200],  // Java Sea
      [-3.322, 114.591],  // Banjarmasin
    ],
  },
  {
    id: "SH-7731",
    name: "Jakarta → Medan",
    color: "#16a34a",
    weight: 2.5,
    mode: "Air",
    carrier: "Lion Parcel",
    units: 320,
    eta: "On time",
    sla: "Express",
    note: "Air freight — estimated 2h flight time.",
    waypoints: [
      [-6.208, 106.845],  // Jakarta
      [0.000,  103.000],  // Air corridor (Malacca Strait)
      [3.595,   98.685],  // Medan
    ],
  },
  {
    id: "SH-7740",
    name: "Surabaya → Makassar",
    color: "#16a34a",
    weight: 2.5,
    mode: "Sea",
    carrier: "Pelni Cargo",
    units: 1200,
    eta: "On time",
    sla: "Standard",
    note: "Flores Sea route. No disruptions reported.",
    waypoints: [
      [-7.248, 112.752],  // Surabaya
      [-7.500, 115.400],  // Bali Sea
      [-6.000, 117.200],  // Flores Sea
      [-5.148, 119.432],  // Makassar
    ],
  },
  {
    id: "SH-7748",
    name: "Bandung → Semarang",
    color: "#d97706",
    weight: 2.5,
    dashArray: "6 4",
    mode: "Road",
    carrier: "JNE Trucking",
    units: 560,
    eta: "+2h drift",
    sla: "Standard",
    note: "Construction delay at Tol Cipali KM 166.",
    waypoints: [
      [-6.917, 107.619],  // Bandung
      [-6.990, 108.800],  // Tol Cipali
      [-6.966, 110.421],  // Semarang
    ],
  },
  {
    id: "SH-7755",
    name: "Jakarta → Surabaya",
    color: "#16a34a",
    weight: 2.5,
    mode: "Road",
    carrier: "JNE Trucking",
    units: 2100,
    eta: "On time",
    sla: "Standard",
    note: "Tol Trans-Jawa. Normal traffic.",
    waypoints: [
      [-6.208, 106.845],  // Jakarta
      [-6.966, 110.421],  // Semarang
      [-7.248, 112.752],  // Surabaya
    ],
  },
  {
    id: "SH-7762",
    name: "Makassar → Manado",
    color: "#d97706",
    weight: 2.5,
    dashArray: "6 4",
    mode: "Sea",
    carrier: "Pelni Cargo",
    units: 380,
    eta: "+8h drift",
    sla: "Standard",
    note: "Sulawesi coastal route. Moderate swell forecast.",
    waypoints: [
      [-5.148, 119.432],  // Makassar
      [-1.000, 120.700],  // Gulf of Tomini
      [1.474,  124.842],  // Manado
    ],
  },
];

// City hubs with coordinates [lat, lng]
const HUBS: { key: string; name: string; coords: [number, number]; major: boolean }[] = [
  { key: "jakarta",     name: "Jakarta",      coords: [-6.208, 106.845], major: true  },
  { key: "bandung",     name: "Bandung",      coords: [-6.917, 107.619], major: false },
  { key: "semarang",    name: "Semarang",     coords: [-6.966, 110.421], major: true  },
  { key: "surabaya",    name: "Surabaya",     coords: [-7.248, 112.752], major: true  },
  { key: "denpasar",    name: "Denpasar",     coords: [-8.650, 115.212], major: false },
  { key: "banjarmasin", name: "Banjarmasin",  coords: [-3.322, 114.591], major: false },
  { key: "makassar",    name: "Makassar",     coords: [-5.148, 119.432], major: true  },
  { key: "medan",       name: "Medan",        coords: [ 3.595,  98.685], major: true  },
  { key: "manado",      name: "Manado",       coords: [ 1.474, 124.842], major: false },
];

// ── Leaflet map (client-only) ────────────────────────────────────────────────
function LogisticsMap() {
  const [selectedLane, setSelectedLane] = useState<string | null>(null);
  const selected = LANE_DETAIL.find((l) => l.id === selectedLane) ?? null;

  useEffect(() => {
    // Dynamic import to avoid SSR issues
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      const container = document.getElementById("logistics-map");
      if (!container || (container as any)._leaflet_id) return;

      const map = L.map(container, {
        center: [-2.5, 112],
        zoom: 5,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      // Draw lanes
      LANE_DETAIL.forEach((lane) => {
        const poly = L.polyline(lane.waypoints, {
          color: lane.color,
          weight: lane.weight,
          dashArray: lane.dashArray,
          opacity: 0.85,
        }).addTo(map);

        poly.bindPopup(`
          <div style="font-family:Inter,sans-serif;min-width:200px">
            <div style="font-weight:600;font-size:13px;margin-bottom:4px">${lane.id} — ${lane.name}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:11px;color:#555">
              <span>Mode</span><span>${lane.mode}</span>
              <span>Carrier</span><span>${lane.carrier}</span>
              <span>Units</span><span>${lane.units.toLocaleString()}</span>
              <span>ETA</span><span style="color:${lane.eta === "On time" ? "#16a34a" : "#dc2626"};font-weight:600">${lane.eta}</span>
              <span>SLA</span><span style="color:${lane.sla === "Critical" ? "#dc2626" : "#555"}">${lane.sla}</span>
            </div>
            <div style="margin-top:6px;padding:6px;background:#f8f8f8;border-radius:4px;font-size:11px;color:#666">${lane.note}</div>
          </div>
        `);
      });

      // Draw city markers
      HUBS.forEach((hub) => {
        const circle = L.circleMarker(hub.coords, {
          radius: hub.major ? 7 : 5,
          fillColor: "#A31F34",
          color: "white",
          weight: 2,
          fillOpacity: 1,
        }).addTo(map);

        circle.bindTooltip(hub.name, {
          permanent: true,
          direction: "top",
          offset: [0, -8],
          className: "leaflet-hub-label",
        });
      });

      // Clean up on unmount
      return () => { map.remove(); };
    })();
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .leaflet-hub-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          font-family: Inter, sans-serif;
          font-size: 11px;
          font-weight: 600;
          color: #1a1a2e;
          white-space: nowrap;
        }
        .leaflet-hub-label::before { display: none !important; }
        .leaflet-popup-content-wrapper {
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }
      `}</style>
      <div id="logistics-map" style={{ height: 440, width: "100%", borderRadius: 0, zIndex: 0 }} />
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "white",
          borderRadius: 8,
          padding: "8px 12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          fontSize: 11,
          fontFamily: "Inter, sans-serif",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666" }}>Lane status</div>
        {[
          { color: "#dc2626", dash: true,  label: "Critical · drifting" },
          { color: "#d97706", dash: true,  label: "Minor drift" },
          { color: "#16a34a", dash: false, label: "On time" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width={24} height={4}>
              <line
                x1={0} y1={2} x2={24} y2={2}
                stroke={l.color}
                strokeWidth={2.5}
                strokeDasharray={l.dash ? "5 3" : undefined}
              />
            </svg>
            <span style={{ color: "#444" }}>{l.label}</span>
          </div>
        ))}
        <div style={{ marginTop: 4, borderTop: "1px solid #eee", paddingTop: 4, color: "#888", fontSize: 10 }}>
          Click any route for details
        </div>
      </div>
    </div>
  );
}

// ── Lane performance stats ───────────────────────────────────────────────────
const LANE_STATS = [
  { lane: "Semarang → Makassar", mode: "Sea", onTime30d: 0.72, avgDelay: "+5.4h", incidents: 4, risk: "High"   },
  { lane: "Surabaya → Makassar", mode: "Sea", onTime30d: 0.89, avgDelay: "+1.2h", incidents: 1, risk: "Low"    },
  { lane: "Jakarta → Surabaya",  mode: "Road",onTime30d: 0.93, avgDelay: "+0.9h", incidents: 0, risk: "Low"    },
  { lane: "Jakarta → Denpasar",  mode: "Road",onTime30d: 0.87, avgDelay: "+1.8h", incidents: 2, risk: "Medium" },
  { lane: "Makassar → Manado",   mode: "Sea", onTime30d: 0.79, avgDelay: "+3.1h", incidents: 3, risk: "Medium" },
];

function etaTone(eta: string): "danger" | "warning" | "success" {
  if (eta === "On time") return "success";
  if (eta.startsWith("+22")) return "danger";
  return "warning";
}

// ── Page ─────────────────────────────────────────────────────────────────────
function LogisticsPage() {
  const drifting = SHIPMENTS.filter((s) => s.eta !== "On time").length;
  const onTime   = SHIPMENTS.filter((s) => s.eta === "On time").length;
  const critical = SHIPMENTS.filter((s) => s.sla === "Critical").length;
  const totalUnits = SHIPMENTS.reduce((s, r) => s + r.units, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Logistics"
        title="Shipments"
        description="ETA drift signals feed the shipment delay detector. Click any route on the map to see details."
      />

      <div className="px-6 py-6 md:px-8 space-y-4">

        {/* Fleet KPI row */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Active shipments</div>
            <div className="num mt-2 text-2xl font-semibold">{SHIPMENTS.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">{formatNumber(totalUnits)} units in transit</div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">On time</div>
            <div className="num mt-2 text-2xl font-semibold text-success">{onTime}</div>
            <div className="mt-1"><Chip tone="success">{Math.round((onTime / SHIPMENTS.length) * 100)}% fleet</Chip></div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">ETA drifting</div>
            <div className="num mt-2 text-2xl font-semibold text-warning">{drifting}</div>
            <div className="mt-1"><Chip tone="warning">{drifting} with delay</Chip></div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">SLA critical</div>
            <div className="num mt-2 text-2xl font-semibold text-destructive">{critical}</div>
            <div className="mt-1"><Chip tone={critical > 0 ? "danger" : "success"}>{critical > 0 ? "Needs action" : "None"}</Chip></div>
          </div>
        </div>

        {/* Interactive Leaflet map */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-medium flex items-center justify-between">
            <span>Indonesia Shipment Routes</span>
            <span className="text-[11px] text-muted-foreground">OSM · Zoom & pan · Click route for details</span>
          </div>
          <ClientOnly fallback={
            <div style={{ height: 440 }} className="flex items-center justify-center text-sm text-muted-foreground bg-surface-2">
              Loading map…
            </div>
          }>
            <LogisticsMap />
          </ClientOnly>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">

          {/* Lane reliability (30d) */}
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">Lane reliability (30d)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Lane</th>
                  <th className="px-4 py-2.5 text-right font-medium">On time</th>
                  <th className="px-4 py-2.5 text-right font-medium">Avg delay</th>
                  <th className="px-4 py-2.5 text-left font-medium">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {LANE_STATS.map((r) => (
                  <tr key={r.lane} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-xs">{r.lane}</div>
                      <div className="text-[11px] text-muted-foreground">{r.mode} · {r.incidents} incidents</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-14 rounded-full bg-border overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.onTime30d * 100}%`, background: r.onTime30d >= 0.9 ? "var(--color-success)" : r.onTime30d >= 0.8 ? "var(--color-warning)" : "var(--color-destructive)" }} />
                        </div>
                        <span className="num text-xs">{Math.round(r.onTime30d * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right num text-muted-foreground text-xs">{r.avgDelay}</td>
                    <td className="px-4 py-2.5">
                      <Chip tone={r.risk === "High" ? "danger" : r.risk === "Medium" ? "warning" : "success"}>{r.risk}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Carrier performance */}
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">Carrier performance (30d)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Carrier</th>
                  <th className="px-4 py-2.5 text-left font-medium">Mode</th>
                  <th className="px-4 py-2.5 text-right font-medium">On time</th>
                  <th className="px-4 py-2.5 text-right font-medium">Avg delay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CARRIER_PERF.sort((a, b) => b.onTimeRate - a.onTimeRate).map((c) => (
                  <tr key={c.carrier} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-2.5">
                      <div>{c.carrier}</div>
                      <div className="text-[11px] text-muted-foreground">{c.shipments30d} shipments</div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.mode}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Chip tone={c.onTimeRate >= 0.9 ? "success" : c.onTimeRate >= 0.8 ? "warning" : "danger"}>
                        {formatPct(c.onTimeRate)}
                      </Chip>
                    </td>
                    <td className="px-4 py-2.5 text-right num text-muted-foreground">{c.avgDelayH}h</td>
                  </tr>
                ))}
                <tr className="bg-surface-2/40 text-[11px] font-semibold">
                  <td className="px-4 py-2.5 text-muted-foreground uppercase tracking-wider" colSpan={2}>Fleet average</td>
                  <td className="px-4 py-2.5 text-right num text-success">86%</td>
                  <td className="px-4 py-2.5 text-right num text-muted-foreground">2.5h</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Shipments detail table */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">Active shipments</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">ID</th>
                  <th className="px-4 py-2.5 text-left font-medium">Lane</th>
                  <th className="px-4 py-2.5 text-left font-medium">Carrier</th>
                  <th className="px-4 py-2.5 text-right font-medium">Units</th>
                  <th className="px-4 py-2.5 text-left font-medium">Mode</th>
                  <th className="px-4 py-2.5 text-left font-medium">ETA</th>
                  <th className="px-4 py-2.5 text-left font-medium">SLA</th>
                  <th className="px-4 py-2.5 text-left font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {LANE_DETAIL.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-2.5 num font-medium">{r.id}</td>
                    <td className="px-4 py-2.5">{r.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.carrier}</td>
                    <td className="px-4 py-2.5 text-right num">{formatNumber(r.units)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.mode}</td>
                    <td className="px-4 py-2.5"><Chip tone={etaTone(r.eta)}>{r.eta}</Chip></td>
                    <td className="px-4 py-2.5">
                      <Chip tone={r.sla === "Critical" ? "danger" : r.sla === "Express" ? "primary" : "neutral"}>{r.sla}</Chip>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-muted-foreground max-w-xs truncate">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
