import { createFileRoute } from "@tanstack/react-router";
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

const CITIES: Record<string, { x: number; y: number; label: string }> = {
  jakarta:     { x: 192, y: 206, label: "Jakarta" },
  bandung:     { x: 210, y: 225, label: "Bandung" },
  semarang:    { x: 276, y: 196, label: "Semarang" },
  surabaya:    { x: 340, y: 202, label: "Surabaya" },
  denpasar:    { x: 390, y: 230, label: "Denpasar" },
  banjarmasin: { x: 436, y: 156, label: "Banjarmasin" },
  makassar:    { x: 520, y: 200, label: "Makassar" },
  medan:       { x:  76, y:  80, label: "Medan" },
  manado:      { x: 594, y: 112, label: "Manado" },
};

const LANES = [
  { id: "SH-7712", from: "semarang",  to: "makassar",    color: "#dc2626", dashArray: "8 4" },
  { id: "SH-7718", from: "jakarta",   to: "denpasar",    color: "#16a34a", dashArray: "none" },
  { id: "SH-7723", from: "surabaya",  to: "banjarmasin", color: "#d97706", dashArray: "6 3" },
  { id: "SH-7731", from: "jakarta",   to: "medan",       color: "#16a34a", dashArray: "none" },
  { id: "SH-7740", from: "surabaya",  to: "makassar",    color: "#16a34a", dashArray: "none" },
  { id: "SH-7748", from: "bandung",   to: "semarang",    color: "#d97706", dashArray: "6 3" },
  { id: "SH-7755", from: "jakarta",   to: "surabaya",    color: "#16a34a", dashArray: "none" },
  { id: "SH-7762", from: "makassar",  to: "manado",      color: "#d97706", dashArray: "6 3" },
];

function IndonesiaIslands() {
  return (
    <g fill="oklch(0 0 0 / 6%)" stroke="oklch(0 0 0 / 14%)" strokeWidth="0.8">
      <polygon points="58,55 84,40 112,48 148,62 174,86 180,118 168,148 150,170 128,182 106,174 86,154 68,132 50,100 48,72" />
      <polygon points="166,192 198,188 242,184 290,183 340,185 384,192 414,202 416,216 388,224 346,218 298,215 248,213 202,218 172,215 162,206" />
      <ellipse cx="400" cy="226" rx="14" ry="9" />
      <ellipse cx="424" cy="230" rx="10" ry="8" />
      <polygon points="296,80 340,60 400,52 460,58 510,72 532,98 538,132 526,160 504,178 474,184 440,178 408,164 376,148 346,134 318,118 298,102" />
      <polygon points="530,92 550,78 566,82 574,100 580,124 568,148 554,164 540,172 524,168 514,152 516,132 528,116 534,104" />
      <polygon points="554,148 572,152 590,162 602,178 596,192 578,188 562,174 550,160" />
      <polygon points="536,130 548,120 566,112 582,108 592,118 582,132 564,138 548,140" />
      <ellipse cx="650" cy="138" rx="12" ry="18" />
      <polygon points="700,100 740,88 790,96 830,110 850,130 840,154 818,162 784,156 748,144 720,132 706,118" />
      <polygon points="790,108 830,96 868,98 900,108 900,160 880,178 850,182 818,170 790,152 778,132" />
      <ellipse cx="460" cy="248" rx="22" ry="8" />
      <ellipse cx="500" cy="254" rx="16" ry="7" />
      <ellipse cx="438" cy="244" rx="16" ry="7" />
    </g>
  );
}

function CurvedLane({ from, to, color, dashArray, id }: { from: string; to: string; color: string; dashArray: string; id: string }) {
  const f = CITIES[from]!;
  const t = CITIES[to]!;
  const mx = (f.x + t.x) / 2;
  const my = (f.y + t.y) / 2 - 28;
  const d = `M ${f.x} ${f.y} Q ${mx} ${my} ${t.x} ${t.y}`;
  const dashed = dashArray !== "none";
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth="6" strokeOpacity="0.15" strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? dashArray : undefined}>
        {dashed && <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1.4s" repeatCount="indefinite" />}
      </path>
      <text x={mx} y={my - 6} textAnchor="middle" fontSize="9" fill={color} fontFamily="Inter,sans-serif" fontWeight="600">{id}</text>
    </g>
  );
}

const ACTIVE_CITIES = new Set(LANES.flatMap((l) => [l.from, l.to]));

function CityDot({ city, highlight }: { city: { x: number; y: number; label: string }; highlight?: boolean }) {
  return (
    <g>
      {highlight && <circle cx={city.x} cy={city.y} r="8" fill="oklch(0.42 0.175 15)" fillOpacity="0.15" />}
      <circle cx={city.x} cy={city.y} r={highlight ? 4.5 : 3} fill={highlight ? "oklch(0.42 0.175 15)" : "oklch(0.45 0.01 275)"} stroke="white" strokeWidth="1.5" />
      <text x={city.x} y={city.y - 8} textAnchor="middle" fontSize="9.5" fill="oklch(0.25 0.01 275)" fontFamily="Inter,sans-serif" fontWeight="500">{city.label}</text>
    </g>
  );
}

function etaTone(eta: string): "danger" | "warning" | "success" {
  if (eta === "On time") return "success";
  if (eta.includes("22h") || eta === "Critical") return "danger";
  return "warning";
}

function LogisticsPage() {
  const drifting  = SHIPMENTS.filter((s) => s.eta !== "On time").length;
  const onTime    = SHIPMENTS.filter((s) => s.eta === "On time").length;
  const critical  = SHIPMENTS.filter((s) => s.sla === "Critical").length;

  return (
    <AppShell>
      <PageHeader eyebrow="Logistics" title="Shipments" description="ETA drift signals feed the shipment delay detector. Active lanes and carrier performance below." />

      <div className="px-6 py-6 md:px-8 space-y-4">

        {/* Summary row */}
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

        {/* Map */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-medium">Indonesia Lane Map</div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 rounded bg-red-600" /> Critical · drifting
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 rounded bg-amber-600" style={{ backgroundImage: "repeating-linear-gradient(to right, #d97706 0,#d97706 4px,transparent 4px,transparent 7px)" }} /> Minor drift
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 rounded bg-green-600" /> On time
              </span>
            </div>
          </div>
          <div className="bg-[oklch(0.97_0.004_220)] p-2">
            <svg viewBox="0 0 900 300" className="w-full" style={{ maxHeight: 300 }}>
              <rect width="900" height="300" fill="oklch(0.88 0.04 220)" rx="4" />
              <defs>
                <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                  <path d="M 60 0 L 0 0 0 60" fill="none" stroke="oklch(0.7 0.04 220)" strokeWidth="0.4" />
                </pattern>
              </defs>
              <rect width="900" height="300" fill="url(#grid)" />
              <IndonesiaIslands />
              {LANES.map((l) => <CurvedLane key={l.id} {...l} />)}
              {Object.entries(CITIES).map(([key, city]) => (
                <CityDot key={key} city={city} highlight={ACTIVE_CITIES.has(key)} />
              ))}
              <g transform="translate(858, 32)">
                <circle r="14" fill="white" fillOpacity="0.7" />
                <text textAnchor="middle" y="-4" fontSize="8" fill="#374151" fontWeight="700">N</text>
                <path d="M0,-10 L2,2 L0,0 L-2,2 Z" fill="#374151" />
              </g>
              <g transform="translate(30, 278)">
                <line x1="0" y1="0" x2="80" y2="0" stroke="oklch(0.4 0 0)" strokeWidth="1.5" />
                <line x1="0" y1="-3" x2="0" y2="3" stroke="oklch(0.4 0 0)" strokeWidth="1.5" />
                <line x1="80" y1="-3" x2="80" y2="3" stroke="oklch(0.4 0 0)" strokeWidth="1.5" />
                <text x="40" y="-5" textAnchor="middle" fontSize="8" fill="oklch(0.4 0 0)">≈ 500 km</text>
              </g>
            </svg>
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
