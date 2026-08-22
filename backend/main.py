"""
AI Exception Orchestrator — FastAPI Backend
Endpoints consumed by the React frontend.
"""

import os, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:4173"],
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
    # This endpoint runs all 3 exceptions through the full pipeline
    # and returns results ready for the frontend to consume.
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
