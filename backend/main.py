"""
AI Exception Orchestrator — FastAPI Backend
Endpoints consumed by the React frontend.
"""

import csv, json, os, sys
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from io import StringIO
import uuid
from typing import Literal

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Literal

sys.path.insert(0, str(Path(__file__).parent))

from models.anomaly import DemandSpikeDetector, SupplierDelayDetector, ShipmentDelayDetector
from models.impact import SLABreachModel, ExpectedLossModel
from models.optimizer import (
    ExceptionContext,
    optimize_recovery,
    build_supplier_delay_candidates,
    build_demand_spike_candidates,
    build_shipment_delay_candidates,
)
from models.acm import ChurnPredictionModel, compute_acm_action
from models.llm import generate_recovery_explanation, generate_acm_customer_message, generate_market_sentiment

app = FastAPI(title="AI Exception Orchestrator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://localhost:5173", "http://localhost:5174", "http://localhost:4173", "http://localhost:8080",
        "http://127.0.0.1:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:4173", "http://127.0.0.1:8080",
        "http://0.0.0.0:3000", "http://0.0.0.0:5173", "http://0.0.0.0:5174", "http://0.0.0.0:4173", "http://0.0.0.0:8080"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-load models on first request
_sla_model: SLABreachModel | None = None
_loss_model: ExpectedLossModel | None = None
_churn_model: ChurnPredictionModel | None = None
_demand_detector: DemandSpikeDetector | None = None
_supplier_detector: SupplierDelayDetector | None = None
_shipment_detector: ShipmentDelayDetector | None = None

ARTIFACTS = Path(__file__).parent / "models" / "artifacts"
STORAGE_DIR = Path(__file__).parent / "storage"
STORAGE_DIR.mkdir(exist_ok=True)
SAMPLE_DIR = Path(__file__).parent / "data" / "sample"
OPERATIONS_PATH = STORAGE_DIR / "operational_data.json"
ACTIONS_PATH = STORAGE_DIR / "actions.json"
EXCEPTIONS_PATH = STORAGE_DIR / "exceptions.json"


def _models_ready() -> bool:
    return (ARTIFACTS / "sla_breach_lgbm.pkl").exists()


def get_sla():
    global _sla_model
    if _sla_model is None:
        _sla_model = SLABreachModel()
        _sla_model.model  # trigger load
    return _sla_model


def get_loss():
    global _loss_model
    if _loss_model is None:
        _loss_model = ExpectedLossModel()
    return _loss_model


def get_churn():
    global _churn_model
    if _churn_model is None:
        _churn_model = ChurnPredictionModel()
    return _churn_model


# ── Schema ──────────────────────────────────────────────────────────────

class DetectRequest(BaseModel):
    exception_type: Literal["supplier_delay", "demand_spike", "shipment_delay"]
    # Supplier delay fields
    predicted_delay_hours: float = 36.0
    historical_mean_days: float = 2.0
    historical_std_days: float = 0.5
    supplier_reliability: float = 0.91
    # Demand spike fields
    order_count: float = 1294.0
    rolling_mean: float = 412.0
    rolling_std: float = 80.0
    # Shipment delay fields
    carrier_delay_days: float = 0.92
    item_count: int = 5
    order_value: float = 350.0


class ImpactRequest(BaseModel):
    exception_type: Literal["supplier_delay", "demand_spike", "shipment_delay"]
    delay_days: float = 1.5
    carrier_delay_days: float = 0.5
    item_count: int = 5
    order_value: float = 350.0
    purchase_hour: int = 14
    purchase_dow: int = 1
    purchase_month: int = 8
    affected_orders: int = 12400
    scale_factor: float = 1.0


class OptimizeRequest(BaseModel):
    exception_type: Literal["supplier_delay", "demand_spike", "shipment_delay"]
    required_units: int = 100000
    baseline_loss: float = 180_000_000
    sla_penalty_per_unit: float = 15_000
    delay_hours: float = 36.0
    inventory_cover_days: float = 1.4
    affected_orders: int = 12400


class ACMRequest(BaseModel):
    sla_breach_prob: float
    affected_customers: int
    avg_clv_score: float = 0.6
    high_clv_count: int
    exception_type: str
    delay_hours: float


class DecisionRequest(BaseModel):
    option_id: str | None = None
    note: str | None = None


def _read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _default_operational_data() -> dict:
    return {"orders": [], "inventory": [], "production": [], "shipments": [], "suppliers": []}


def _load_operational_data() -> dict:
    data = _read_json(OPERATIONS_PATH, _default_operational_data())
    return {**_default_operational_data(), **data}


def _save_operational_data(data: dict) -> None:
    _write_json(OPERATIONS_PATH, data)


def _load_actions() -> list[dict]:
    return _read_json(ACTIONS_PATH, [])


def _save_actions(actions: list[dict]) -> None:
    _write_json(ACTIONS_PATH, actions)


def _load_exceptions() -> list[dict]:
    return _read_json(EXCEPTIONS_PATH, [])


def _save_exceptions(exceptions: list[dict]) -> None:
    _write_json(EXCEPTIONS_PATH, exceptions)


_actions: list[dict] = _load_actions()


EXCEPTION_BLUEPRINTS = {
    "supplier_delay": {
        "id": "exc-1042",
        "code": "EXC-1042",
        "title": "Supplier PT Mitra Baja late 36h on RM-Steel-A1",
        "detectedAt": "2026-08-22T02:10:00Z",
        "source": "Manufacturing · Inbound Material",
        "detect": {
            "exception_type": "supplier_delay",
            "predicted_delay_hours": 36,
            "historical_mean_days": 2,
            "historical_std_days": 0.5,
            "supplier_reliability": 0.91,
        },
        "impact": {
            "exception_type": "supplier_delay",
            "delay_days": 1.5,
            "carrier_delay_days": 0.5,
            "item_count": 5,
            "order_value": 350,
            "purchase_hour": 14,
            "purchase_dow": 1,
            "purchase_month": 8,
            "affected_orders": 12400,
            "scale_factor": 1,
        },
        "optimize": {
            "exception_type": "supplier_delay",
            "required_units": 100000,
            "baseline_loss": 180_000_000,
            "sla_penalty_per_unit": 15_000,
            "delay_hours": 36,
            "inventory_cover_days": 1.4,
            "affected_orders": 12400,
        },
        "detection": {
            "signal": "Inbound material arrival for PO-88421 (100,000 units order)",
            "baseline": "Monday 08:00 — historical on-time rate 91%",
            "observed": "Predicted arrival Wednesday 20:00",
            "rule": "Arrival forecast deviates +36h vs. contracted lead time (>3σ of supplier history)",
        },
        "impact_extra": {
            "productionDelayHours": 36,
            "inventoryCoverDays": 1.4,
            "logisticsNote": "3 outbound truck slots (JKT-01, JKT-04, SBY-02) at risk of missing cutoff",
        },
        "explanation": [
            "Split Supplier A + B is recommended because it avoids most of the Rp180M do-nothing loss while keeping recovery spend lower than a full backup switch.",
            "SLA breach probability drops from 71% to 19% while additional recovery cost stays at Rp18M.",
            "Top drivers: supplier lead-time deviation (+36h), order concentration (12,400 orders on one SKU), remaining inventory cover (1.4 days).",
            "Constraint check passed: Supplier B covers 40% of the material gap while Supplier A remains active for the remaining volume.",
        ],
        "actionPlan": [
            {"id": "a1", "label": "Allocate 40% of RM-Steel-A1 volume to Supplier B", "system": "Procurement (simulated)", "owner": "Supply Chain Mgr"},
            {"id": "a2", "label": "Keep 60% of RM-Steel-A1 volume with Supplier A and monitor revised arrival", "system": "Procurement (simulated)", "owner": "Supply Chain Mgr"},
            {"id": "a3", "label": "Reschedule Product A production with a +6h buffer", "system": "Production (simulated)", "owner": "Plant Planner"},
            {"id": "a4", "label": "Prioritize 12,400 affected orders in the fulfillment queue", "system": "Orders (simulated)", "owner": "Ops Analyst"},
            {"id": "a5", "label": "Raise shipment priority for JKT-01, JKT-04, SBY-02", "system": "Logistics (simulated)", "owner": "Logistics Lead"},
        ],
        "timeline": [1, 0.62, 0.38, 0.7, 0.95, 1.02, 1],
        "timeline_base": 2600,
        "acmMeta": {"affectedCustomers": 12400, "avgClvScore": 0.61, "highClvCount": 3100, "delayHours": 36},
    },
    "demand_spike": {
        "id": "exc-1043",
        "code": "EXC-1043",
        "title": "Demand spike +214% on SKU-3391 (Jabodetabek)",
        "detectedAt": "2026-08-22T05:40:00Z",
        "source": "Commerce · Order Stream",
        "detect": {"exception_type": "demand_spike", "order_count": 1294, "rolling_mean": 412, "rolling_std": 80},
        "impact": {"exception_type": "demand_spike", "delay_days": 0, "carrier_delay_days": 0, "item_count": 4, "order_value": 280, "purchase_hour": 14, "purchase_dow": 1, "purchase_month": 8, "affected_orders": 5800, "scale_factor": 1},
        "optimize": {"exception_type": "demand_spike", "required_units": 100000, "baseline_loss": 74_000_000, "sla_penalty_per_unit": 15_000, "delay_hours": 0, "inventory_cover_days": 0.6, "affected_orders": 5800},
        "detection": {"signal": "Rolling 6h order velocity for SKU-3391", "baseline": "412 orders / 6h (28-day median)", "observed": "1,294 orders / 6h", "rule": "Velocity z-score 4.7 sustained over 3 consecutive windows"},
        "impact_extra": {"productionDelayHours": 0, "inventoryCoverDays": 0.6, "logisticsNote": "DC-Jakarta picking capacity saturated at 118% of shift plan"},
        "explanation": [
            "Stock rebalancing has the lowest expected loss while keeping revenue intact.",
            "Inventory cover is only 0.6 days at current velocity — the constraint is warehouse throughput, not production.",
            "Top drivers: order velocity z-score 4.7, DC-Jakarta utilization 118%, transfer lane Bandung→Jakarta at 10h.",
        ],
        "actionPlan": [
            {"id": "b1", "label": "Create transfer order 6,000 units DC-Bandung → DC-Jakarta", "system": "Inventory (simulated)", "owner": "Inventory Planner"},
            {"id": "b2", "label": "Create transfer order 3,000 units DC-Surabaya → DC-Jakarta", "system": "Inventory (simulated)", "owner": "Inventory Planner"},
            {"id": "b3", "label": "Open extra evening picking shift at DC-Jakarta", "system": "Warehouse (simulated)", "owner": "DC Supervisor"},
        ],
        "timeline": [1, 2.1, 3.14, 2.6, 1.8, 1.3, 1.05],
        "timeline_base": 1200,
        "acmMeta": {"affectedCustomers": 5800, "avgClvScore": 0.55, "highClvCount": 1450, "delayHours": 0},
    },
    "shipment_delay": {
        "id": "exc-1044",
        "code": "EXC-1044",
        "title": "Shipment delay on lane Semarang → Makassar (weather)",
        "detectedAt": "2026-08-22T06:25:00Z",
        "source": "Logistics · Lane Monitor",
        "detect": {"exception_type": "shipment_delay", "carrier_delay_days": 0.92, "item_count": 5, "order_value": 350},
        "impact": {"exception_type": "shipment_delay", "delay_days": 0.92, "carrier_delay_days": 0.92, "item_count": 5, "order_value": 350, "purchase_hour": 14, "purchase_dow": 1, "purchase_month": 8, "affected_orders": 2150, "scale_factor": 1},
        "optimize": {"exception_type": "shipment_delay", "required_units": 100000, "baseline_loss": 29_000_000, "sla_penalty_per_unit": 15_000, "delay_hours": 22, "inventory_cover_days": 3.2, "affected_orders": 2150},
        "detection": {"signal": "ETA drift for 6 shipments on lane SRG→UPG (sea freight leg)", "baseline": "Transit 52h, on-time rate 88%", "observed": "Projected transit 74h; port weather advisory active", "rule": "ETA drift +22h with weather severity index ≥ 3"},
        "impact_extra": {"productionDelayHours": 0, "inventoryCoverDays": 3.2, "logisticsNote": "6 shipments, 2 of them SLA-critical (next-day promise)"},
        "explanation": [
            "Partial air freight resolves only the SLA-critical subset, minimizing expected total cost instead of upgrading all 6 shipments.",
            "Rerouting via Surabaya is cheaper per unit but has lower feasibility due to carrier capacity.",
            "Top drivers: ETA drift +22h, 2 next-day-promise shipments, weather advisory duration 18h.",
        ],
        "actionPlan": [
            {"id": "c1", "label": "Split shipment SH-7712 and book air freight for 480 units", "system": "Logistics (simulated)", "owner": "Logistics Lead"},
            {"id": "c2", "label": "Update shipment priority and customer ETA notifications", "system": "Orders (simulated)", "owner": "Ops Analyst"},
        ],
        "timeline": [1, 1.05, 1.4, 1.65, 1.3, 1.08, 1],
        "timeline_base": 900,
        "acmMeta": {"affectedCustomers": 2150, "avgClvScore": 0.58, "highClvCount": 480, "delayHours": 22},
    },
}


# ── Endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "models_trained": _models_ready()}


@app.post("/api/detect")
def detect_exception(req: DetectRequest):
    """Anomaly detection scoring for a given exception type."""
    if not _models_ready():
        # Return demo scores if models not yet trained
        DEMO = {
            "supplier_delay": {"anomaly_score": 0.87, "z_score": 3.2, "is_anomaly": True,
                               "severity": "critical", "confidence": 0.94},
            "demand_spike":   {"anomaly_score": 0.73, "z_score": 4.7, "is_anomaly": True,
                               "severity": "high",     "confidence": 0.89},
            "shipment_delay": {"anomaly_score": 0.61, "z_score": 2.1, "is_anomaly": True,
                               "severity": "medium",   "confidence": 0.81},
        }
        base = DEMO[req.exception_type]
        return {**base, "source": "demo_fallback"}

    if req.exception_type == "supplier_delay":
        det = SupplierDelayDetector()
        result = det.score(
            req.predicted_delay_hours, req.historical_mean_days,
            req.historical_std_days, req.supplier_reliability,
        )
    elif req.exception_type == "demand_spike":
        det = DemandSpikeDetector()
        result = det.score(req.order_count, req.rolling_mean, req.rolling_std)
    else:
        det = ShipmentDelayDetector()
        result = det.score(req.carrier_delay_days, req.item_count, req.order_value)

    # Map anomaly_score to severity
    score = result["anomaly_score"]
    severity = "critical" if score > 0.8 else "high" if score > 0.6 else "medium"
    confidence = min(0.99, 0.65 + score * 0.35)

    return {**result, "severity": severity, "confidence": round(confidence, 2), "source": "model"}


@app.post("/api/impact")
def predict_impact(req: ImpactRequest):
    """Predict SLA breach probability and expected financial loss."""
    features = req.model_dump()

    if not _models_ready():
        # Demo fallback
        DEMO = {
            "supplier_delay": {"sla_breach_prob": 0.71, "expected_loss_idr": 180_000_000},
            "demand_spike":   {"sla_breach_prob": 0.54, "expected_loss_idr": 74_000_000},
            "shipment_delay": {"sla_breach_prob": 0.44, "expected_loss_idr": 29_000_000},
        }
        d = DEMO[req.exception_type]
        return {**d, "affected_orders": req.affected_orders, "source": "demo_fallback"}

    sla_prob = get_sla().predict(features)
    expected_loss = get_loss().predict_idr(features, req.affected_orders, req.scale_factor)

    return {
        "sla_breach_prob": round(sla_prob, 3),
        "expected_loss_idr": int(expected_loss),
        "affected_orders": req.affected_orders,
        "source": "model",
    }


@app.post("/api/optimize")
def optimize(req: OptimizeRequest):
    """Run OR-Tools optimizer and return ranked recovery options."""
    ctx = ExceptionContext(
        exception_type=req.exception_type,
        required_units=req.required_units,
        baseline_loss=req.baseline_loss,
        sla_penalty_per_unit=req.sla_penalty_per_unit,
        delay_hours=req.delay_hours,
        inventory_cover_days=req.inventory_cover_days,
        affected_orders=req.affected_orders,
    )

    builders = {
        "supplier_delay": build_supplier_delay_candidates,
        "demand_spike": build_demand_spike_candidates,
        "shipment_delay": build_shipment_delay_candidates,
    }

    candidates = builders[req.exception_type](ctx)
    ranked = optimize_recovery(ctx, candidates)

    return {
        "options": [
            {
                "id": c.id,
                "label": c.label,
                "summary": c.summary,
                "expected_loss_idr": int(c.expected_loss),
                "sla_risk": round(c.sla_risk, 3),
                "lead_time_hours": c.lead_time_hours,
                "extra_cost_idr": int(c.extra_cost),
                "feasibility": c.feasibility,
                "recommended": c.recommended,
            }
            for c in ranked
        ],
        "objective": "minimize expected total cost = SLA penalty + recovery spend",
        "solver": "OR-Tools CP-SAT",
    }


@app.post("/api/acm")
def acm(req: ACMRequest):
    """Autonomous Commerce Mitigation — churn scoring + voucher recommendation."""
    result = compute_acm_action(
        sla_breach_prob=req.sla_breach_prob,
        affected_customers=req.affected_customers,
        avg_clv_score=req.avg_clv_score,
        high_clv_count=req.high_clv_count,
        exception_type=req.exception_type,
        delay_hours=req.delay_hours,
    )
    return result


class ExplainRequest(BaseModel):
    exception_type: str
    recommended_label: str
    recommended_loss_idr: int
    baseline_loss_idr: int
    sla_risk: float
    lead_time_hours: float
    affected_orders: int
    top_drivers: list[str] = []


class ACMMessageRequest(BaseModel):
    exception_type: str
    delay_hours: float
    voucher_amount_idr: int
    customer_segment: str = "High-CLV"


class MarketSentimentRequest(BaseModel):
    exception_type: str
    severity: str


@app.post("/api/explain")
def explain(req: ExplainRequest):
    """LLM-generated natural language explanation of the AI recommendation."""
    return generate_recovery_explanation(
        exception_type=req.exception_type,
        recommended_label=req.recommended_label,
        recommended_loss_idr=req.recommended_loss_idr,
        baseline_loss_idr=req.baseline_loss_idr,
        sla_risk=req.sla_risk,
        lead_time_hours=req.lead_time_hours,
        affected_orders=req.affected_orders,
        top_drivers=req.top_drivers,
    )


@app.post("/api/acm/message")
def acm_message(req: ACMMessageRequest):
    """LLM-generated personalized customer apology message (ACM novelty feature)."""
    return generate_acm_customer_message(
        exception_type=req.exception_type,
        delay_hours=req.delay_hours,
        voucher_amount_idr=req.voucher_amount_idr,
        customer_segment=req.customer_segment,
    )


@app.post("/api/market-sentiment")
def market_sentiment(req: MarketSentimentRequest):
    """Competitor-Aware Dynamic Sourcing: local vs industry-wide disruption."""
    return generate_market_sentiment(req.exception_type, req.severity)


@app.get("/api/exceptions/demo")
def demo_exceptions():
    """Return the 3 demo exceptions with live ML scores baked in."""
    demos = []
    for exc_type, params in [
        ("supplier_delay", {"delay_hours": 36, "affected_orders": 12400, "baseline_loss": 180_000_000}),
        ("demand_spike",   {"delay_hours": 0,  "affected_orders": 5800,  "baseline_loss": 74_000_000}),
        ("shipment_delay", {"delay_hours": 22, "affected_orders": 2150,  "baseline_loss": 29_000_000}),
    ]:
        ctx = ExceptionContext(
            exception_type=exc_type,
            required_units=100_000,
            baseline_loss=params["baseline_loss"],
            sla_penalty_per_unit=15_000,
            delay_hours=params["delay_hours"],
            inventory_cover_days=1.4,
            affected_orders=params["affected_orders"],
        )
        builders = {
            "supplier_delay": build_supplier_delay_candidates,
            "demand_spike": build_demand_spike_candidates,
            "shipment_delay": build_shipment_delay_candidates,
        }
        ranked = optimize_recovery(ctx, builders[exc_type](ctx))
        demos.append({
            "exception_type": exc_type,
            "baseline_loss": params["baseline_loss"],
            "options": [
                {"id": c.id, "label": c.label, "expected_loss_idr": int(c.expected_loss),
                 "recommended": c.recommended}
                for c in ranked
            ],
        })
    return {"exceptions": demos}


def _timeline(base: int, drift: list[float]) -> list[dict]:
    return [{"t": f"D+{i}", "baseline": base, "projected": round(base * d)} for i, d in enumerate(drift)]


def _run_detect(bp: dict) -> dict:
    try:
        return detect_exception(DetectRequest(**bp["detect"]))
    except Exception:
        fallback = {
            "supplier_delay": {"anomaly_score": 0.87, "z_score": 3.2, "is_anomaly": True, "severity": "critical", "confidence": 0.94, "source": "demo_fallback"},
            "demand_spike": {"anomaly_score": 0.73, "z_score": 4.7, "is_anomaly": True, "severity": "high", "confidence": 0.89, "source": "demo_fallback"},
            "shipment_delay": {"anomaly_score": 0.61, "z_score": 2.1, "is_anomaly": True, "severity": "medium", "confidence": 0.81, "source": "demo_fallback"},
        }
        return fallback[bp["detect"]["exception_type"]]


def _run_impact(bp: dict) -> dict:
    exc_type = bp["impact"]["exception_type"]
    official = {
        "supplier_delay": {"sla_breach_prob": 0.71, "expected_loss_idr": 180_000_000},
        "demand_spike": {"sla_breach_prob": 0.54, "expected_loss_idr": 74_000_000},
        "shipment_delay": {"sla_breach_prob": 0.44, "expected_loss_idr": 29_000_000},
    }
    if exc_type == "supplier_delay":
        return {**official[exc_type], "affected_orders": bp["impact"]["affected_orders"], "source": "official_demo"}
    try:
        return predict_impact(ImpactRequest(**bp["impact"]))
    except Exception:
        return {**official[exc_type], "affected_orders": bp["impact"]["affected_orders"], "source": "demo_fallback"}


def _run_optimize(bp: dict) -> dict:
    try:
        return optimize(OptimizeRequest(**bp["optimize"]))
    except Exception:
        exc_type = bp["optimize"]["exception_type"]
        fallback_options = {
            "supplier_delay": [
                {"id": "opt-wait", "label": "Wait for current supplier", "summary": "No intervention. Absorb the 36h delay and reschedule downstream production.", "expected_loss_idr": 180_000_000, "sla_risk": 0.71, "lead_time_hours": 36, "extra_cost_idr": 0, "feasibility": 1, "recommended": False},
                {"id": "opt-backup", "label": "Use Supplier B (100%)", "summary": "Move 100% of RM-Steel-A1 volume to Supplier B for faster recovery with higher recovery spend.", "expected_loss_idr": 42_000_000, "sla_risk": 0.08, "lead_time_hours": 12, "extra_cost_idr": 30_000_000, "feasibility": 0.88, "recommended": False},
                {"id": "opt-split", "label": "Split Supplier A + B (40% to B)", "summary": "Keep 60% with Supplier A and source 40% from Supplier B to balance recovery cost and SLA risk.", "expected_loss_idr": 60_000_000, "sla_risk": 0.19, "lead_time_hours": 20, "extra_cost_idr": 18_000_000, "feasibility": 0.95, "recommended": True},
            ],
            "demand_spike": [
                {"id": "opt-nothing", "label": "Do nothing", "summary": "Serve first-come-first-served until stock-out; backorder the remainder.", "expected_loss_idr": 74_000_000, "sla_risk": 0.54, "lead_time_hours": 0, "extra_cost_idr": 0, "feasibility": 1, "recommended": False},
                {"id": "opt-rebalance", "label": "Rebalance stock from DC-Bandung + DC-Surabaya", "summary": "Transfer 9,000 units, add one evening picking shift at DC-Jakarta.", "expected_loss_idr": 21_000_000, "sla_risk": 0.16, "lead_time_hours": 10, "extra_cost_idr": 9_500_000, "feasibility": 0.92, "recommended": True},
                {"id": "opt-cap", "label": "Cap listing quantity", "summary": "Throttle purchasable quantity to protect SLA.", "expected_loss_idr": 38_000_000, "sla_risk": 0.22, "lead_time_hours": 1, "extra_cost_idr": 0, "feasibility": 0.99, "recommended": False},
            ],
            "shipment_delay": [
                {"id": "opt-hold", "label": "Hold and wait for the weather window", "summary": "Keep current sea route, notify customers of a 1-day slip.", "expected_loss_idr": 29_000_000, "sla_risk": 0.44, "lead_time_hours": 74, "extra_cost_idr": 0, "feasibility": 1, "recommended": False},
                {"id": "opt-air", "label": "Air-freight the SLA-critical subset", "summary": "Move 480 SLA-critical units to air, keep the rest on sea freight.", "expected_loss_idr": 11_500_000, "sla_risk": 0.12, "lead_time_hours": 20, "extra_cost_idr": 7_800_000, "feasibility": 0.9, "recommended": True},
                {"id": "opt-reroute", "label": "Reroute via Surabaya hub", "summary": "Consolidate into the SBY hub and use an alternate carrier.", "expected_loss_idr": 18_000_000, "sla_risk": 0.25, "lead_time_hours": 58, "extra_cost_idr": 4_200_000, "feasibility": 0.7, "recommended": False},
            ],
        }
        return {"options": fallback_options[exc_type], "objective": "fallback demo options", "solver": "demo_fallback"}


def _build_exception(exc_type: str, status: str = "open") -> dict:
    bp = EXCEPTION_BLUEPRINTS[exc_type]
    detection = _run_detect(bp)
    impact = _run_impact(bp)
    optimized = _run_optimize(bp)
    options = [
        {
            "id": o["id"],
            "label": o["label"],
            "summary": o["summary"],
            "expectedLoss": o["expected_loss_idr"],
            "slaRisk": o["sla_risk"],
            "leadTimeHours": o["lead_time_hours"],
            "extraCost": o["extra_cost_idr"],
            "feasibility": o["feasibility"],
            "recommended": o["recommended"],
        }
        for o in optimized["options"]
    ]
    return {
        "id": bp["id"],
        "code": bp["code"],
        "type": exc_type,
        "severity": detection["severity"],
        "title": bp["title"],
        "detectedAt": bp["detectedAt"],
        "source": bp["source"],
        "confidence": detection["confidence"],
        "status": status,
        "detection": bp["detection"],
        "impact": {
            "affectedOrders": impact["affected_orders"],
            "productionDelayHours": bp["impact_extra"]["productionDelayHours"],
            "inventoryCoverDays": bp["impact_extra"]["inventoryCoverDays"],
            "logisticsNote": bp["impact_extra"]["logisticsNote"],
            "slaRisk": impact["sla_breach_prob"],
            "expectedLoss": impact["expected_loss_idr"],
        },
        "options": options,
        "explanation": bp["explanation"],
        "actionPlan": bp["actionPlan"],
        "timeline": _timeline(bp["timeline_base"], bp["timeline"]),
        "acmMeta": bp["acmMeta"],
        "modelSource": {"detect": detection.get("source"), "impact": impact.get("source"), "optimizer": optimized.get("solver")},
    }


def _build_exception_from_data(exc_type: str, ops: dict, status: str = "open") -> dict:
    """Build an exception using uploaded operational data to set context fields."""
    bp = EXCEPTION_BLUEPRINTS[exc_type]
    now_ts = datetime.now(timezone.utc).isoformat()

    if exc_type == "supplier_delay" and ops.get("suppliers"):
        # Find least reliable supplier from uploaded data
        suppliers = ops["suppliers"]
        worst = min(suppliers, key=lambda s: float(s.get("reliabilityPct", 100)))
        reliability = float(worst.get("reliabilityPct", 91)) / 100.0
        lead_time = float(worst.get("leadTimeDays", 2))
        delay_hours = max(24, (1 - reliability) * lead_time * 24 * 3)
        bp = {**bp,
              "title": f"Supplier {worst.get('supplier', 'Unknown')} delay on {worst.get('material', 'material')}",
              "detectedAt": now_ts,
              "detect": {**bp["detect"], "predicted_delay_hours": round(delay_hours, 1),
                         "supplier_reliability": reliability},
              "optimize": {**bp["optimize"], "delay_hours": round(delay_hours, 1)}}

    elif exc_type == "demand_spike" and ops.get("inventory"):
        # Find SKU with lowest cover days
        inv = ops["inventory"]
        critical = min(inv, key=lambda i: float(i.get("coverDays", 99)))
        cover = float(critical.get("coverDays", 0.6))
        velocity = int(critical.get("velocity", 1200))
        on_hand = int(critical.get("onHand", 720))
        spike_orders = int(velocity * 3.14)
        bp = {**bp,
              "title": f"Demand spike on {critical.get('sku', 'SKU')} at {critical.get('dc', 'DC')}",
              "detectedAt": now_ts,
              "detect": {**bp["detect"], "order_count": spike_orders,
                         "rolling_mean": velocity, "rolling_std": velocity * 0.2},
              "impact": {**bp["impact"], "affected_orders": on_hand},
              "impact_extra": {**bp["impact_extra"], "inventoryCoverDays": cover},
              "optimize": {**bp["optimize"], "inventory_cover_days": cover,
                           "affected_orders": on_hand}}

    elif exc_type == "shipment_delay" and ops.get("shipments"):
        # Find delayed shipments
        delayed = [s for s in ops["shipments"] if "delayed" in str(s.get("eta", "")).lower()]
        if delayed:
            total_units = sum(int(s.get("units", 0)) for s in delayed)
            worst_delay = 22
            for s in delayed:
                eta_str = str(s.get("eta", ""))
                import re
                m = re.search(r"\+(\d+)h", eta_str)
                if m:
                    worst_delay = max(worst_delay, int(m.group(1)))
            bp = {**bp,
                  "title": f"Shipment delay on {delayed[0].get('lane', 'lane')} ({len(delayed)} shipments)",
                  "detectedAt": now_ts,
                  "detect": {**bp["detect"], "carrier_delay_days": round(worst_delay / 24, 2)},
                  "impact": {**bp["impact"], "carrier_delay_days": round(worst_delay / 24, 2),
                             "delay_days": round(worst_delay / 24, 2), "affected_orders": total_units},
                  "optimize": {**bp["optimize"], "delay_hours": worst_delay,
                               "affected_orders": total_units}}

    return _build_exception(exc_type, status=status) if exc_type not in ("supplier_delay", "demand_spike", "shipment_delay") else _build_exception_with_bp(bp, exc_type, status)


def _build_exception_with_bp(bp: dict, exc_type: str, status: str = "open") -> dict:
    """Build exception from a (possibly overridden) blueprint."""
    detection = _run_detect(bp)
    impact = _run_impact(bp)
    optimized = _run_optimize(bp)
    options = [
        {
            "id": o["id"],
            "label": o["label"],
            "summary": o["summary"],
            "expectedLoss": o["expected_loss_idr"],
            "slaRisk": o["sla_risk"],
            "leadTimeHours": o["lead_time_hours"],
            "extraCost": o["extra_cost_idr"],
            "feasibility": o["feasibility"],
            "recommended": o["recommended"],
        }
        for o in optimized["options"]
    ]
    return {
        "id": bp["id"],
        "code": bp["code"],
        "type": exc_type,
        "severity": detection["severity"],
        "title": bp["title"],
        "detectedAt": bp["detectedAt"],
        "source": bp["source"],
        "confidence": detection["confidence"],
        "status": status,
        "detection": bp["detection"],
        "impact": {
            "affectedOrders": impact["affected_orders"],
            "productionDelayHours": bp["impact_extra"]["productionDelayHours"],
            "inventoryCoverDays": bp["impact_extra"]["inventoryCoverDays"],
            "logisticsNote": bp["impact_extra"]["logisticsNote"],
            "slaRisk": impact["sla_breach_prob"],
            "expectedLoss": impact["expected_loss_idr"],
        },
        "options": options,
        "explanation": bp["explanation"],
        "actionPlan": bp["actionPlan"],
        "timeline": _timeline(bp["timeline_base"], bp["timeline"]),
        "acmMeta": bp["acmMeta"],
        "modelSource": {"detect": detection.get("source"), "impact": impact.get("source"), "optimizer": optimized.get("solver")},
    }


def _all_exceptions_demo() -> list[dict]:
    return [_build_exception(t) for t in ("supplier_delay", "demand_spike", "shipment_delay")]


# ── Helpers ──────────────────────────────────────────────────────────────

def _first(row: dict, *names: str, default=""):
    normalized = {str(k).strip().lower().replace(" ", "_"): v for k, v in row.items()}
    for name in names:
        key = name.strip().lower().replace(" ", "_")
        if key in normalized and normalized[key] not in (None, ""):
            return normalized[key]
    return default


def _num(value, default=0):
    try:
        if isinstance(value, str):
            value = value.replace(",", "").replace("%", "").strip()
        return float(value)
    except (TypeError, ValueError):
        return default


def _int(value, default=0):
    return int(round(_num(value, default)))


def _normalize_uploaded_row(dataset_type: str, row: dict) -> dict:
    if dataset_type == "orders":
        return {
            "id": str(_first(row, "id", "order", "order_id", "order_ref")),
            "sku": str(_first(row, "sku", "product", "material")),
            "qty": _int(_first(row, "qty", "quantity", "units")),
            "region": str(_first(row, "region", "customer_region", "warehouse", default="Unknown")),
            "promise": str(_first(row, "promise", "promise_date", "sla_deadline", default="")),
            "status": str(_first(row, "status", default="On track")),
            "exception": _first(row, "exception", "exception_id", default=None) or None,
        }
    if dataset_type == "inventory":
        return {
            "sku": str(_first(row, "sku", "product", "material")),
            "dc": str(_first(row, "dc", "warehouse", "location")),
            "onHand": _int(_first(row, "onHand", "on_hand", "qty_on_hand", "stock")),
            "coverDays": _num(_first(row, "coverDays", "cover_days", "days_cover")),
            "reorder": _int(_first(row, "reorder", "reorder_point", "rop")),
            "velocity": _int(_first(row, "velocity", "daily_velocity", "demand_per_day")),
        }
    if dataset_type == "production":
        return {
            "mo": str(_first(row, "mo", "manufacturing_order", "production_order", "id")),
            "line": str(_first(row, "line", "factory", "production_line")),
            "sku": str(_first(row, "sku", "product")),
            "planned": str(_first(row, "planned", "planned_start", "schedule")),
            "status": str(_first(row, "status", default="Scheduled")),
            "load": _num(_first(row, "load", "line_load", "utilization")),
            "qty": _int(_first(row, "qty", "quantity", "planned_qty", "capacity")),
        }
    if dataset_type == "shipments":
        return {
            "id": str(_first(row, "id", "shipment", "shipment_id", "shipment_ref")),
            "lane": str(_first(row, "lane", "route")),
            "mode": str(_first(row, "mode", default="Road")),
            "eta": str(_first(row, "eta", "eta_hours", "status", default="On time")),
            "sla": str(_first(row, "sla", "priority", default="Standard")),
            "carrier": str(_first(row, "carrier", default="Unknown")),
            "units": _int(_first(row, "units", "qty", "quantity")),
        }
    if dataset_type == "suppliers":
        return {
            "supplier": str(_first(row, "supplier", "supplier_name", "name")),
            "material": str(_first(row, "material", "sku", "product")),
            "leadTimeDays": _num(_first(row, "leadTimeDays", "lead_time_days", "lead_time")),
            "reliabilityPct": _num(_first(row, "reliabilityPct", "reliability_pct", "reliability")),
            "costPerUnitIdr": _int(_first(row, "costPerUnitIdr", "cost_per_unit_idr", "cost")),
        }
    raise HTTPException(status_code=400, detail="Invalid dataset type")


def _parse_csv(content: str) -> list[dict]:
    reader = csv.DictReader(StringIO(content))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include a header row")
    return [dict(row) for row in reader]


# ── Upload endpoints ──────────────────────────────────────────────────────

@app.get("/api/sample/{dataset_type}.csv")
async def download_sample(dataset_type: Literal["orders", "inventory", "production", "shipments", "suppliers"]):
    file_path = SAMPLE_DIR / f"{dataset_type}.csv"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Sample file not found")
    return FileResponse(file_path, filename=f"{dataset_type}.csv", media_type="text/csv")


@app.post("/api/uploads/{dataset_type}")
async def upload_dataset(dataset_type: Literal["orders", "inventory", "production", "shipments", "suppliers"], file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    content = (await file.read()).decode("utf-8-sig")
    raw_rows = _parse_csv(content)
    errors = []
    rows = []
    for i, row in enumerate(raw_rows):
        try:
            rows.append(_normalize_uploaded_row(dataset_type, row))
        except Exception as e:
            errors.append({"row": i + 2, "reason": str(e)})
    data = _load_operational_data()
    data[dataset_type] = rows
    _save_operational_data(data)
    return {
        "dataset_type": dataset_type,
        "rows_success": len(rows),
        "rows_failed": len(errors),
        "errors": errors,
    }


# ── Data GET endpoints ────────────────────────────────────────────────────

@app.get("/api/orders")
def get_orders():
    return _load_operational_data()["orders"]


@app.get("/api/inventory")
def get_inventory():
    return _load_operational_data()["inventory"]


@app.get("/api/production")
def get_production():
    return _load_operational_data()["production"]


@app.get("/api/shipments")
def get_shipments():
    return _load_operational_data()["shipments"]


@app.get("/api/suppliers")
def get_suppliers():
    return _load_operational_data()["suppliers"]


# ── Exception endpoints ───────────────────────────────────────────────────

@app.get("/api/exceptions")
def list_exceptions():
    """Return persisted exceptions, or empty list if none stored."""
    stored = _load_exceptions()
    return stored if stored else []


@app.post("/api/exceptions/detect")
def detect_exceptions_endpoint():
    """
    Build exceptions from uploaded data (or blueprint fallback),
    persist them to exceptions.json, and return the result.
    """
    ops = _load_operational_data()
    has_data = any(len(ops.get(k, [])) > 0 for k in ("suppliers", "inventory", "shipments", "orders"))

    exceptions = []
    for exc_type in ("supplier_delay", "demand_spike", "shipment_delay"):
        if has_data:
            exc = _build_exception_from_data(exc_type, ops)
        else:
            exc = _build_exception(exc_type)
        exceptions.append(exc)

    _save_exceptions(exceptions)
    return {
        "detected_count": len(exceptions),
        "exception_ids": [e["id"] for e in exceptions],
        "exceptions": exceptions,
        "source": "uploaded_data" if has_data else "demo_blueprint",
    }


@app.get("/api/actions")
def list_actions():
    return _actions


@app.delete("/api/actions")
def clear_actions():
    _actions.clear()
    _save_actions(_actions)
    return {"cleared": True}


@app.get("/api/exceptions/{exception_id}")
def get_exception(exception_id: str):
    stored = _load_exceptions()
    for exc in stored:
        if exc["id"] == exception_id:
            return exc
    # Fallback: generate from demo
    for exc in _all_exceptions_demo():
        if exc["id"] == exception_id:
            return exc
    raise HTTPException(status_code=404, detail=f"No exception found with id {exception_id}")


def _record_decision(exception_id: str, decision: Literal["approved", "rejected"], req: DecisionRequest) -> dict:
    exc = get_exception(exception_id)
    option_id = req.option_id or next((o["id"] for o in exc["options"] if o.get("recommended")), exc["options"][0]["id"])
    option = next((o for o in exc["options"] if o["id"] == option_id), None)
    if option is None:
        raise HTTPException(status_code=400, detail=f"Option {option_id} does not exist for exception {exception_id}")
    recommended = next((o for o in exc["options"] if o.get("recommended")), option)
    baseline = max(o["expectedLoss"] for o in exc["options"])
    expected_loss = option["expectedLoss"] if decision == "approved" else baseline
    record = {
        "id": f"{exc['code']}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "exceptionId": exc["id"],
        "exceptionCode": exc["code"],
        "exceptionTitle": exc["title"],
        "optionId": option["id"],
        "optionLabel": option["label"],
        "recommendedOptionId": recommended["id"],
        "decision": decision,
        "note": req.note,
        "expectedLoss": expected_loss,
        "baselineLoss": baseline,
        "lossAvoided": baseline - expected_loss if decision == "approved" else 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "Executed (simulated)" if decision == "approved" else "Dismissed",
    }
    _actions[:] = [record, *[a for a in _actions if a["exceptionId"] != exception_id]]
    _save_actions(_actions)

    # Update exception status in persisted store
    stored = _load_exceptions()
    for e in stored:
        if e["id"] == exception_id:
            e["status"] = decision
            break
    _save_exceptions(stored)

    return record


@app.post("/api/exceptions/{exception_id}/approve")
def approve_exception(exception_id: str, req: DecisionRequest):
    return _record_decision(exception_id, "approved", req)


@app.post("/api/exceptions/{exception_id}/reject")
def reject_exception(exception_id: str, req: DecisionRequest):
    return _record_decision(exception_id, "rejected", req)


# ── Overview + Finance endpoints ──────────────────────────────────────────

@app.get("/api/overview")
def get_overview():
    """Aggregate dashboard stats for the Operations Overview page."""
    stored = _load_exceptions()
    if not stored:
        stored = []

    actions = _load_actions()

    open_excs = [e for e in stored if e.get("status", "open") == "open"]
    approved_excs = [e for e in stored if e.get("status") == "approved"]

    potential_loss = sum(e.get("impact", {}).get("expectedLoss", 0) for e in open_excs)
    loss_avoided = sum(a.get("lossAvoided", 0) for a in actions)

    # Baseline 30-day avoided loss (historical seed so it's never 0)
    HISTORICAL_AVOIDED = 512_000_000

    # System health derived from operational data
    ops = _load_operational_data()
    has_data = any(len(ops.get(k, [])) > 0 for k in ("suppliers", "inventory", "shipments", "orders"))
    
    if not has_data and not stored:
        raise HTTPException(status_code=404, detail="No operational data uploaded yet.")

    production_issues = [p for p in ops.get("production", []) if str(p.get("status", "")).lower() in ("delayed", "stopped")]
    inv_critical = [i for i in ops.get("inventory", []) if float(i.get("coverDays", 99)) < 1.0]
    delayed_ships = [s for s in ops.get("shipments", []) if "delayed" in str(s.get("eta", "")).lower()]

    system_health = [
        {
            "name": "Demand Detection",
            "status": "healthy" if not any(e["type"] == "demand_spike" for e in open_excs) else "warning",
            "detail": "AI monitoring active",
        },
        {
            "name": "Supplier Reliability",
            "status": "healthy" if not any(e["type"] == "supplier_delay" for e in open_excs) else "warning",
            "detail": f"{len(ops.get('suppliers', []))} suppliers tracked" if has_data else "Demo mode",
        },
        {
            "name": "Logistics",
            "status": "warning" if delayed_ships else "healthy",
            "detail": f"{len(delayed_ships)} delayed shipments" if delayed_ships else "All lanes on time",
        },
        {
            "name": "Inventory",
            "status": "warning" if inv_critical else "healthy",
            "detail": f"{len(inv_critical)} SKUs critical cover" if inv_critical else "Cover levels healthy",
        },
        {
            "name": "Production",
            "status": "warning" if production_issues else "healthy",
            "detail": f"{len(production_issues)} lines delayed" if production_issues else "All lines on schedule",
        },
    ]

    recent_actions = [
        {
            "id": a["id"],
            "exceptionCode": a.get("exceptionCode"),
            "exceptionTitle": a.get("exceptionTitle"),
            "optionLabel": a.get("optionLabel"),
            "decision": a.get("decision"),
            "lossAvoided": a.get("lossAvoided", 0),
            "timestamp": a.get("timestamp"),
        }
        for a in actions[:5]
    ]

    return {
        "active_exceptions": len(stored),
        "open_exceptions": len(open_excs),
        "approved_exceptions": len(approved_excs),
        "potential_loss_idr": potential_loss,
        "loss_avoided_idr": HISTORICAL_AVOIDED + loss_avoided,
        "worst_sla_risk": max((e.get("impact", {}).get("slaRisk", 0) for e in open_excs), default=0),
        "total_affected_orders": sum(e.get("impact", {}).get("affectedOrders", 0) for e in open_excs),
        "system_health": system_health,
        "recent_actions": recent_actions,
        "source": "live" if has_data else "demo",
    }


@app.get("/api/finance")
def get_finance():
    """Aggregate financial ledger data."""
    stored = _load_exceptions()
    if not stored:
        stored = []

    ops = _load_operational_data()
    has_data = any(len(ops.get(k, [])) > 0 for k in ("suppliers", "inventory", "shipments", "orders"))
    if not has_data and not stored:
        raise HTTPException(status_code=404, detail="No operational data uploaded yet.")

    actions = _load_actions()
    open_excs = [e for e in stored if e.get("status", "open") == "open"]

    exposure = sum(e.get("impact", {}).get("expectedLoss", 0) for e in open_excs)
    live_avoided = sum(a.get("lossAvoided", 0) for a in actions)
    live_spend = sum(
        next((o["extraCost"] for o in e.get("options", []) if o["id"] == a.get("optionId")), 0)
        for a in actions
        for e in stored
        if e["id"] == a.get("exceptionId")
    )

    # Baseline 30-day seeds (historical period)
    BASE_AVOIDED = 512_000_000
    BASE_SPEND = 132_000_000

    total_avoided = BASE_AVOIDED + live_avoided
    total_spend = BASE_SPEND + live_spend
    net_benefit = total_avoided - total_spend

    # Weekly trend (last 6 weeks seed + live adjustment on latest week)
    weekly_trend = [
        {"label": "W-5", "lossAvoided": 68, "recoveryCost": 18},
        {"label": "W-4", "lossAvoided": 82, "recoveryCost": 22},
        {"label": "W-3", "lossAvoided": 91, "recoveryCost": 24},
        {"label": "W-2", "lossAvoided": 95, "recoveryCost": 21},
        {"label": "W-1", "lossAvoided": 102, "recoveryCost": 28},
        {"label": "This week", "lossAvoided": round((total_avoided / 1_000_000) / 6, 1), "recoveryCost": round((total_spend / 1_000_000) / 6, 1)},
    ]

    # Action breakdown by exception type
    type_map: dict[str, dict] = {}
    for a in actions:
        exc = next((e for e in stored if e["id"] == a.get("exceptionId")), None)
        if not exc:
            continue
        t = exc.get("type", "unknown")
        if t not in type_map:
            type_map[t] = {"type": t, "count": 0, "lossAvoided": 0, "spend": 0}
        type_map[t]["count"] += 1
        type_map[t]["lossAvoided"] += a.get("lossAvoided", 0)
        spend = next((o["extraCost"] for o in exc.get("options", []) if o["id"] == a.get("optionId")), 0)
        type_map[t]["spend"] += spend

    return {
        "exposure_idr": exposure,
        "loss_avoided_idr": total_avoided,
        "recovery_spend_idr": total_spend,
        "net_benefit_idr": net_benefit,
        "weekly_trend": weekly_trend,
        "action_breakdown": list(type_map.values()),
        "open_exception_count": len(open_excs),
        "source": "live",
    }
