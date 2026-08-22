import { createFileRoute } from "@tanstack/react-router";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
} from "react-simple-maps";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { SHIPMENTS, CARRIER_PERF, formatNumber, formatPct } from "@/lib/ops-data";

export const Route = createFileRoute("/logistics")({
  head: () => ({
    meta: [
      { title: "Logistics — Nusantara Seller Operations" },
      { name: "description", content: "Lane monitoring with ETA drift and SLA classification per shipment." },
      { property: "og:title", content: "Logistics — Nusantara Seller Operations" },
      { property: "og:description", content: "Shipment lanes, ETA drift and SLA-critical loads." },
    ],
  }),
  component: LogisticsPage,
});

// Real lon/lat coordinates for each hub
const CITIES: Record<string, { coords: [number, number]; label: string; labelOffset?: [number, number] }> = {
  jakarta:     { coords: [106.845, -6.208],  label: "Jakarta",     labelOffset: [-10, -10] },
  bandung:     { coords: [107.619, -6.917],  label: "Bandung",     labelOffset: [6, 6] },
  semarang:    { coords: [110.421, -6.966],  label: "Semarang",    labelOffset: [6, -10] },
  surabaya:    { coords: [112.752, -7.248],  label: "Surabaya",    labelOffset: [6, -10] },
  denpasar:    { coords: [115.212, -8.650],  label: "Denpasar",    labelOffset: [6, 4] },
  banjarmasin: { coords: [114.591, -3.322],  label: "Banjarmasin", labelOffset: [6, -10] },
  makassar:    { coords: [119.432, -5.148],  label: "Makassar",    labelOffset: [6, -10] },
  medan:       { coords: [98.685,   3.595],  label: "Medan",       labelOffset: [6, -10] },
  manado:      { coords: [124.842,  1.474],  label: "Manado",      labelOffset: [6, -10] },
};

const LANE_COLORS: Record<string, { color: string; dasharray?: string }> = {
  "SH-7712": { color: "#dc2626", dasharray: "6 3" }, // critical drift
  "SH-7718": { color: "#16a34a" },                   // on time
  "SH-7723": { color: "#d97706", dasharray: "5 3" }, // minor drift
  "SH-7731": { color: "#16a34a" },
  "SH-7740": { color: "#16a34a" },
  "SH-7748": { color: "#d97706", dasharray: "5 3" },
  "SH-7755": { color: "#16a34a" },
  "SH-7762": { color: "#d97706", dasharray: "5 3" },
};

// Map from shipment ID → from/to city keys
const LANE_CITIES: Record<string, [string, string]> = {
  "SH-7712": ["semarang",  "makassar"],
  "SH-7718": ["jakarta",   "denpasar"],
  "SH-7723": ["surabaya",  "banjarmasin"],
  "SH-7731": ["jakarta",   "medan"],
  "SH-7740": ["surabaya",  "makassar"],
  "SH-7748": ["bandung",   "semarang"],
  "SH-7755": ["jakarta",   "surabaya"],
  "SH-7762": ["makassar",  "manado"],
};

// world-atlas 50m — real Indonesia + SE Asia shapes
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

// SE Asia country IDs to show (Indonesia=360, Malaysia=458, Philippines=608,
// Papua New Guinea=598, Timor-Leste=626, Singapore=702, Brunei=96,
// Thailand=764, Vietnam=704, Cambodia=116)
const SHOW_IDS = new Set(["360","458","608","598","626","702","96","764","704","116","104"]);

function etaTone(eta: string): "danger" | "warning" | "success" {
  if (eta === "On time") return "success";
  if (eta.startsWith("+22")) return "danger";
  return "warning";
}

function LogisticsPage() {
  const drifting = SHIPMENTS.filter((s) => s.eta !== "On time").length;
  const onTime   = SHIPMENTS.filter((s) => s.eta === "On time").length;
  const critical = SHIPMENTS.filter((s) => s.sla === "Critical").length;

  const activeCityKeys = new Set(
    Object.entries(LANE_CITIES).flatMap(([, [a, b]]) => [a, b])
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Logistics"
        title="Shipments"
        description="ETA drift signals feed the shipment delay detector. Active lanes and carrier performance below."
      />

      <div className="px-6 py-6 md:px-8 space-y-4">

        {/* Fleet KPI row */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Active shipments</div>
            <div className="num mt-2 text-2xl font-semibold">{SHIPMENTS.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">Across 4 carriers</div>
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

        {/* Real map */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-medium">Indonesia Lane Map</div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1 w-5 rounded bg-red-600" style={{ backgroundImage: "repeating-linear-gradient(to right, #dc2626 0,#dc2626 5px,transparent 5px,transparent 8px)" }} />
                Critical · drifting
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1 w-5 rounded" style={{ backgroundImage: "repeating-linear-gradient(to right, #d97706 0,#d97706 4px,transparent 4px,transparent 7px)" }} />
                Minor drift
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1 w-5 rounded bg-green-600" />
                On time
              </span>
            </div>
          </div>

          <div style={{ background: "oklch(0.91 0.04 220)" }}>
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ center: [118, -4], scale: 1050 }}
              width={900}
              height={310}
              style={{ width: "100%", height: "auto" }}
            >
              {/* Ocean fill is the background div colour */}

              {/* Country shapes — Indonesia + SE Asia */}
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies
                    .filter((geo) => SHOW_IDS.has(String(geo.id)))
                    .map((geo) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        style={{
                          default: {
                            fill: geo.id === 360 ? "oklch(0.96 0.006 90)" : "oklch(0.92 0.01 140)",
                            stroke: "oklch(0.65 0.04 220)",
                            strokeWidth: 0.5,
                            outline: "none",
                          },
                          hover: { fill: "oklch(0.93 0.01 90)", outline: "none" },
                          pressed: { outline: "none" },
                        }}
                      />
                    ))
                }
              </Geographies>

              {/* Shipment lanes */}
              {Object.entries(LANE_CITIES).map(([id, [fromKey, toKey]]) => {
                const from = CITIES[fromKey]!;
                const to   = CITIES[toKey]!;
                const style = LANE_COLORS[id]!;
                return (
                  <Line
                    key={id}
                    from={from.coords}
                    to={to.coords}
                    stroke={style.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray={style.dasharray}
                  />
                );
              })}

              {/* Glow halos behind critical lane */}
              {Object.entries(LANE_CITIES)
                .filter(([id]) => LANE_COLORS[id]?.dasharray)
                .map(([id, [fromKey, toKey]]) => {
                  const from = CITIES[fromKey]!;
                  const to   = CITIES[toKey]!;
                  const style = LANE_COLORS[id]!;
                  return (
                    <Line
                      key={`${id}-glow`}
                      from={from.coords}
                      to={to.coords}
                      stroke={style.color}
                      strokeWidth={6}
                      strokeOpacity={0.15}
                      strokeLinecap="round"
                    />
                  );
                })}

              {/* City markers */}
              {Object.entries(CITIES).map(([key, city]) => {
                const active = activeCityKeys.has(key);
                const [lx, ly] = city.labelOffset ?? [6, -10];
                return (
                  <Marker key={key} coordinates={city.coords}>
                    {active && (
                      <circle
                        r={8}
                        fill="oklch(0.42 0.175 15)"
                        fillOpacity={0.15}
                      />
                    )}
                    <circle
                      r={active ? 4.5 : 2.5}
                      fill={active ? "oklch(0.42 0.175 15)" : "oklch(0.55 0.01 275)"}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                    <text
                      x={lx}
                      y={ly}
                      fontSize={9}
                      fontFamily="Inter, sans-serif"
                      fontWeight={active ? 600 : 400}
                      fill="oklch(0.20 0.01 275)"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {city.label}
                    </text>
                  </Marker>
                );
              })}
            </ComposableMap>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
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
              </tbody>
            </table>
          </div>

          {/* Shipments table */}
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {SHIPMENTS.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-2.5 num font-medium">{r.id}</td>
                      <td className="px-4 py-2.5">{r.lane}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.carrier}</td>
                      <td className="px-4 py-2.5 text-right num">{formatNumber(r.units)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.mode}</td>
                      <td className="px-4 py-2.5">
                        <Chip tone={etaTone(r.eta)}>{r.eta}</Chip>
                      </td>
                      <td className="px-4 py-2.5">
                        <Chip tone={r.sla === "Critical" ? "danger" : r.sla === "Express" ? "primary" : "neutral"}>
                          {r.sla}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
