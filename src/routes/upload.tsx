import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UploadCloud, Play, CheckCircle2, AlertCircle, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader, Chip } from "@/components/ops/AppShell";
import { api, type UploadResult } from "@/lib/api";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload Data — AI Exception Orchestrator" },
      { name: "description", content: "Upload operational CSV data and trigger exception detection." },
    ],
  }),
  component: UploadPage,
});

const DATASETS = [
  {
    id: "orders",
    label: "Orders",
    description: "Order ID, SKU, qty, region, promise date, status",
    requiredHeaders: ["id", "sku", "qty"],
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "SKU, DC/warehouse, on-hand qty, cover days, reorder point",
    requiredHeaders: ["sku", "dc", "onHand"],
  },
  {
    id: "production",
    label: "Production",
    description: "MO number, production line, SKU, planned date, status, load %",
    requiredHeaders: ["mo", "line", "sku"],
  },
  {
    id: "shipments",
    label: "Shipments",
    description: "Shipment ID, lane, mode, ETA status, SLA tier, carrier, units",
    requiredHeaders: ["id", "lane", "eta"],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier name, material, lead time (days), reliability %, cost/unit",
    requiredHeaders: ["supplier", "material", "reliabilityPct"],
  },
] as const;

const SAMPLE_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8000/api/";
function DemoBanner() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong>Tip:</strong> Download the sample CSVs below to see the expected format for each dataset.
        Upload all 5 files, then click <em>Detect Exceptions</em> to run the AI pipeline on your data.
      </span>
    </div>
  );
}

function UploadPage() {
  const navigate = useNavigate();
  const [results, setResults] = useState<Record<string, UploadResult & { fileName?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const uploadFile = async (datasetType: (typeof DATASETS)[number]["id"], file: File | undefined) => {
    if (!file) return;
    setBusy(datasetType);
    try {
      const result = await api.uploadDataset(datasetType, file);
      setResults((current) => ({
        ...current,
        [datasetType]: { ...result, fileName: file.name },
      }));
      if (result.rows_failed > 0) {
        toast.warning(
          `${result.dataset_type}: ${result.rows_success} rows OK, ${result.rows_failed} failed`,
        );
      } else {
        toast.success(`${result.dataset_type}: ${result.rows_success} rows uploaded`);
      }
    } catch (err) {
      toast.error(`Failed to upload ${datasetType}: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setBusy(null);
    }
  };

  const detect = async () => {
    setBusy("detect");
    try {
      const result = await api.detectExceptions();
      const sourceLabel = result.source === "uploaded_data" ? "from your uploaded data" : "using demo blueprints";
      toast.success(`${result.detected_count} exception(s) detected ${sourceLabel}`);
      await navigate({ to: "/ai-operations" });
    } catch {
      toast.error("Backend unavailable. Start FastAPI before detecting exceptions.");
    } finally {
      setBusy(null);
    }
  };

  const uploadedCount = Object.keys(results).length;
  const canDetect = uploadedCount > 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Setup"
        title="Upload operational data"
        description="Load CSV datasets into the backend store, then trigger the AI exception pipeline."
      />

      <div className="px-6 py-6 md:px-8 space-y-4">
        <DemoBanner />

        <div className="panel overflow-hidden">
          <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Dataset</div>
            <div className="col-span-4">File</div>
            <div className="col-span-3 text-center">Result</div>
            <div className="col-span-2 text-right">Sample</div>
          </div>
          <ul className="divide-y divide-border">
            {DATASETS.map((dataset) => {
              const result = results[dataset.id];
              const isUploading = busy === dataset.id;
              return (
                <li key={dataset.id} className="px-4 py-3 space-y-2">
                  <div className="grid grid-cols-12 items-start gap-3">
                    {/* Dataset label */}
                    <div className="col-span-3">
                      <div className="text-sm font-medium">{dataset.label}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground hidden md:block">
                        {dataset.description}
                      </div>
                    </div>

                    {/* File picker */}
                    <div className="col-span-4">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-2">
                        {isUploading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : result ? (
                          <CheckCircle2 className="size-4 text-success" />
                        ) : (
                          <UploadCloud className="size-4" />
                        )}
                        <span className="truncate max-w-[140px]">
                          {isUploading
                            ? "Uploading..."
                            : result?.fileName
                              ? result.fileName
                              : "Choose CSV"}
                        </span>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          disabled={busy !== null}
                          onChange={(event) => uploadFile(dataset.id, event.target.files?.[0])}
                        />
                      </label>
                    </div>

                    {/* Upload result */}
                    <div className="col-span-3 flex flex-col items-center gap-1">
                      {result ? (
                        <>
                          <Chip tone="success">{result.rows_success} rows OK</Chip>
                          {result.rows_failed > 0 && (
                            <Chip tone="danger">{result.rows_failed} failed</Chip>
                          )}
                        </>
                      ) : (
                        <Chip tone="neutral">Not uploaded</Chip>
                      )}
                    </div>

                    {/* Sample download */}
                    <div className="col-span-2 flex justify-end">
                      <a
                        href={`${SAMPLE_BASE}sample/${dataset.id}.csv`}
                        download={`${dataset.id}.csv`}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                        title={`Download sample ${dataset.label} CSV`}
                      >
                        <Download className="size-3" />
                        Sample
                      </a>
                    </div>
                  </div>

                  {/* Error detail rows */}
                  {result && result.errors && result.errors.length > 0 && (
                    <div className="mt-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive space-y-0.5">
                      <div className="font-medium mb-1">Upload errors:</div>
                      {result.errors.slice(0, 5).map((e) => (
                        <div key={e.row}>Row {e.row}: {e.reason}</div>
                      ))}
                      {result.errors.length > 5 && (
                        <div className="text-muted-foreground">…and {result.errors.length - 5} more errors</div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {uploadedCount === 0
              ? "Upload at least one dataset to enable exception detection."
              : `${uploadedCount} of ${DATASETS.length} dataset${uploadedCount > 1 ? "s" : ""} uploaded.`}
          </div>
          <button
            onClick={detect}
            disabled={busy !== null || !canDetect}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "detect" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {busy === "detect" ? "Detecting..." : "Detect Exceptions"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
