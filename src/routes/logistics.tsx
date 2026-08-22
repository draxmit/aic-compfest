import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { DataTable } from "@/components/ops/DataTable";
import { SHIPMENTS } from "@/lib/ops-data";

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

/** City hub coordinates in the 900×360 SVG viewBox */
const CITIES: Record<string, { x: number; y: number; label: string }> = {
  jakarta:     { x: 192, y: 206, label: "Jakarta" },
  bandung:     { x: 210, y: 225, label: "Bandung" },
  semarang:    { x: 276, y: 196, label: "Semarang" },
  surabaya:    { x: 340, y: 202, label: "Surabaya" },
  denpasar:    { x: 390, y: 230, label: "Denpasar" },
  banjarmasin: { x: 436, y: 156, label: "Banjarmasin" },
  makassar:    { x: 520, y: 200, label: "Makassar" },
  medan:       { x:  76, y:  80, label: "Medan" },
};

const LANES = [
  {
    id: "SH-7712",
    from: "semarang",
    to: "makassar",
    mode: "Sea",
    eta: "+22h drift",
    sla: "Critical",
    color: "#dc2626",          // red
    dashArray: "8 4",
  },
  {
    id: "SH-7718",
    from: "jakarta",
    to: "denpasar",
    mode: "Road",
    eta: "On time",
    sla: "Standard",
    color: "#16a34a",          // green
    dashArray: "none",
  },
  {
    id: "SH-7723",
    from: "surabaya",
    to: "banjarmasin",
    mode: "Sea",
    eta: "+4h drift",
    sla: "Standard",
    color: "#d97706",          // amber
    dashArray: "6 3",
  },
];

/** Rough simplified island outlines for Indonesia */
function IndonesiaIslands() {
  return (
    <g fill="oklch(0 0 0 / 6%)" stroke="oklch(0 0 0 / 14%)" strokeWidth="0.8">
      {/* Sumatra */}
      <polygon points="58,55 84,40 112,48 148,62 174,86 180,118 168,148 150,170 128,182 106,174 86,154 68,132 50,100 48,72" />
      {/* Java */}
      <polygon points="166,192 198,188 242,184 290,183 340,185 384,192 414,202 416,216 388,224 346,218 298,215 248,213 202,218 172,215 162,206" />
      {/* Bali */}
      <ellipse cx="400" cy="226" rx="14" ry="9" />
      {/* Lombok */}
      <ellipse cx="424" cy="230" rx="10" ry="8" />
      {/* Kalimantan */}
      <polygon points="296,80 340,60 400,52 460,58 510,72 532,98 538,132 526,160 504,178 474,184 440,178 408,164 376,148 346,134 318,118 298,102" />
      {/* Sulawesi (simplified K-shape) */}
      <polygon points="530,92 550,78 566,82 574,100 580,124 568,148 554,164 540,172 524,168 514,152 516,132 528,116 534,104" />
      <polygon points="554,148 572,152 590,162 602,178 596,192 578,188 562,174 550,160" />
      <polygon points="536,130 548,120 566,112 582,108 592,118 582,132 564,138 548,140" />
      {/* Maluku (tiny) */}
      <ellipse cx="650" cy="138" rx="12" ry="18" />
      {/* West Papua */}
      <polygon points="700,100 740,88 790,96 830,110 850,130 840,154 818,162 784,156 748,144 720,132 706,118" />
      {/* Papua */}
      <polygon points="790,108 830,96 868,98 900,108 900,160 880,178 850,182 818,170 790,152 778,132" />
      {/* Flores/NTT */}
      <ellipse cx="460" cy="248" rx="22" ry="8" />
      <ellipse cx="500" cy="254" rx="16" ry="7" />
      {/* Sumbawa */}
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
      {/* glow */}
      <path d={d} fill="none" stroke={color} strokeWidth="6" strokeOpacity="0.15" strokeLinecap="round" />
      {/* main line */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={dashed ? dashArray : undefined}
      >
        {dashed && (
          <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1.4s" repeatCount="indefinite" />
        )}
      </path>
      {/* midpoint label */}
      <text x={mx} y={my - 6} textAnchor="middle" fontSize="9" fill={color} fontFamily="Inter,sans-serif" fontWeight="600">
        {id}
      </text>
    </g>
  );
}

function CityDot({ city, highlight }: { city: { x: number; y: number; label: string }; highlight?: boolean }) {
  return (
    <g>
      {highlight && <circle cx={city.x} cy={city.y} r="8" fill="oklch(0.42 0.175 15)" fillOpacity="0.15" />}
      <circle cx={city.x} cy={city.y} r={highlight ? 4.5 : 3} fill={highlight ? "oklch(0.42 0.175 15)" : "oklch(0.45 0.01 275)"} stroke="white" strokeWidth="1.5" />
      <text
        x={city.x}
        y={city.y - 8}
        textAnchor="middle"
        fontSize="9.5"
        fill="oklch(0.25 0.01 275)"
        fontFamily="Inter,sans-serif"
        fontWeight="500"
      >
        {city.label}
      </text>
    </g>
  );
}

const ACTIVE_CITIES = new Set(LANES.flatMap((l) => [l.from, l.to]));

function LogisticsPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Logistics" title="Shipments" description="ETA drift signals feed the shipment delay detector." />

      <div className="px-6 py-6 md:px-8 space-y-4">
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
              {/* Ocean background */}
              <rect width="900" height="300" fill="oklch(0.88 0.04 220)" rx="4" />

              {/* Grid lines */}
              <defs>
                <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                  <path d="M 60 0 L 0 0 0 60" fill="none" stroke="oklch(0.7 0.04 220)" strokeWidth="0.4" />
                </pattern>
              </defs>
              <rect width="900" height="300" fill="url(#grid)" />

              {/* Islands */}
              <IndonesiaIslands />

              {/* Lanes */}
              {LANES.map((l) => (
                <CurvedLane key={l.id} {...l} />
              ))}

              {/* City dots — active ones highlighted */}
              {Object.entries(CITIES).map(([key, city]) => (
                <CityDot key={key} city={city} highlight={ACTIVE_CITIES.has(key)} />
              ))}

              {/* Compass */}
              <g transform="translate(858, 32)">
                <circle r="14" fill="white" fillOpacity="0.7" />
                <text textAnchor="middle" y="-4" fontSize="8" fill="#374151" fontWeight="700">N</text>
                <path d="M0,-10 L2,2 L0,0 L-2,2 Z" fill="#374151" />
              </g>

              {/* Scale bar */}
              <g transform="translate(30, 278)">
                <line x1="0" y1="0" x2="80" y2="0" stroke="oklch(0.4 0 0)" strokeWidth="1.5" />
                <line x1="0" y1="-3" x2="0" y2="3" stroke="oklch(0.4 0 0)" strokeWidth="1.5" />
                <line x1="80" y1="-3" x2="80" y2="3" stroke="oklch(0.4 0 0)" strokeWidth="1.5" />
                <text x="40" y="-5" textAnchor="middle" fontSize="8" fill="oklch(0.4 0 0)">≈ 500 km</text>
              </g>
            </svg>
          </div>
        </div>

        {/* Shipments table */}
        <DataTable
          rows={SHIPMENTS}
          columns={[
            { key: "id", label: "Shipment", render: (r) => <span className="num font-medium">{r.id}</span> },
            { key: "lane", label: "Lane", render: (r) => r.lane },
            { key: "mode", label: "Mode", render: (r) => r.mode },
            {
              key: "eta",
              label: "ETA",
              render: (r) => (r.eta === "On time" ? <Chip tone="success">{r.eta}</Chip> : <Chip tone="warning">{r.eta}</Chip>),
            },
            {
              key: "sla",
              label: "SLA",
              render: (r) => (r.sla === "Critical" ? <Chip tone="danger">{r.sla}</Chip> : <Chip>{r.sla}</Chip>),
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
