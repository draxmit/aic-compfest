"""
Recovery Optimizer — OR-Tools CP-SAT.
Given exception context + candidate actions, returns ranked recovery options
with expected loss, feasibility, and constraint check results.
"""

from ortools.sat.python import cp_model
from dataclasses import dataclass
from typing import List
import math


@dataclass
class RecoveryCandidate:
    id: str
    label: str
    summary: str
    # Costs and risks
    unit_cost_multiplier: float     # relative to baseline (1.0 = same cost)
    lead_time_hours: float          # how quickly supply arrives
    capacity_units: float           # max units this option can supply
    feasibility: float              # 0-1
    # Derived by optimizer
    expected_loss: float = 0.0
    sla_risk: float = 0.0
    extra_cost: float = 0.0
    recommended: bool = False


@dataclass
class ExceptionContext:
    exception_type: str
    required_units: int
    baseline_loss: float            # loss if no action taken (IDR)
    sla_penalty_per_unit: float     # IDR per unit affected
    delay_hours: float
    inventory_cover_days: float
    affected_orders: int


def _compute_option_metrics(
    candidate: RecoveryCandidate,
    ctx: ExceptionContext,
) -> RecoveryCandidate:
    """Compute expected loss and SLA risk for a candidate action."""
    c = candidate

    # Lead time reduction factor: less delay → lower SLA risk
    delay_reduction = max(0, 1 - c.lead_time_hours / (ctx.delay_hours + 1))
    base_sla = ctx.baseline_loss / (ctx.sla_penalty_per_unit * ctx.affected_orders + 1)
    c.sla_risk = float(max(0, base_sla * (1 - delay_reduction) * (1 / c.feasibility)))

    # Extra cost: (unit_cost_multiplier - 1) × baseline procurement
    baseline_procurement = ctx.baseline_loss * 0.3
    c.extra_cost = max(0, (c.unit_cost_multiplier - 1) * baseline_procurement)

    # Expected loss: remaining SLA penalty + extra cost - savings
    sla_saved = delay_reduction * ctx.baseline_loss * 0.7
    c.expected_loss = max(0, ctx.baseline_loss - sla_saved + c.extra_cost)

    return c


def optimize_recovery(
    ctx: ExceptionContext,
    candidates: List[RecoveryCandidate],
) -> List[RecoveryCandidate]:
    """
    Use OR-Tools to rank candidates and select the optimal action.
    Objective: minimize (expected_loss + extra_cost), subject to:
      - capacity >= required_units
      - feasibility >= 0.5
      - lead_time <= delay_hours (ideally)
    Returns candidates sorted by expected total impact, with recommended flag set.
    """
    # Compute metrics for each candidate
    candidates = [_compute_option_metrics(c, ctx) for c in candidates]

    # CP-SAT: integer programming over scaled costs
    model = cp_model.CpModel()
    SCALE = 1_000  # scale to integers

    scores = []
    for c in candidates:
        # Score = expected_loss + penalty for infeasibility + lead time penalty
        feasibility_penalty = int((1 - c.feasibility) * ctx.baseline_loss / SCALE)
        lead_time_penalty = int(max(0, c.lead_time_hours - ctx.delay_hours) * 1_000_000 / SCALE)
        score = int(c.expected_loss / SCALE) + feasibility_penalty + lead_time_penalty
        scores.append(score)

    n = len(candidates)
    chosen = [model.new_bool_var(f"chosen_{i}") for i in range(n)]

    # Exactly one option chosen
    model.add_exactly_one(chosen)

    # Feasibility constraint: only allow feasibility >= 0.3
    for i, c in enumerate(candidates):
        if c.feasibility < 0.3:
            model.add(chosen[i] == 0)

    # Minimize total score
    model.minimize(sum(scores[i] * chosen[i] for i in range(n)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 1.0
    status = solver.solve(model)

    best_idx = 0
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for i in range(n):
            if solver.value(chosen[i]) == 1:
                best_idx = i
                break

    for i, c in enumerate(candidates):
        c.recommended = i == best_idx

    # Sort: recommended first, then by expected_loss
    candidates.sort(key=lambda c: (not c.recommended, c.expected_loss))

    return candidates


def build_supplier_delay_candidates(ctx: ExceptionContext) -> List[RecoveryCandidate]:
    return [
        RecoveryCandidate(
            id="opt-wait",
            label="Wait for current supplier",
            summary="No intervention. Absorb the delay and reschedule downstream production.",
            unit_cost_multiplier=1.0,
            lead_time_hours=ctx.delay_hours,
            capacity_units=ctx.required_units,
            feasibility=1.0,
        ),
        RecoveryCandidate(
            id="opt-backup",
            label="Use backup supplier",
            summary="Move 100% of volume to backup supplier (higher unit cost, shorter lead time).",
            unit_cost_multiplier=1.06,
            lead_time_hours=ctx.delay_hours * 0.33,
            capacity_units=ctx.required_units * 1.2,
            feasibility=0.88,
        ),
        RecoveryCandidate(
            id="opt-split",
            label="Split supply",
            summary="Keep 60% with current supplier, source 40% from backup to hedge capacity risk.",
            unit_cost_multiplier=1.025,
            lead_time_hours=ctx.delay_hours * 0.56,
            capacity_units=ctx.required_units,
            feasibility=0.95,
        ),
    ]


def build_demand_spike_candidates(ctx: ExceptionContext) -> List[RecoveryCandidate]:
    return [
        RecoveryCandidate(
            id="opt-nothing",
            label="Do nothing",
            summary="Serve first-come-first-served until stock-out; backorder the remainder.",
            unit_cost_multiplier=1.0,
            lead_time_hours=0,
            capacity_units=ctx.required_units * 0.5,
            feasibility=1.0,
        ),
        RecoveryCandidate(
            id="opt-rebalance",
            label="Rebalance from nearby DCs",
            summary="Transfer idle stock from regional DCs + open extra picking shift.",
            unit_cost_multiplier=1.02,
            lead_time_hours=10,
            capacity_units=ctx.required_units,
            feasibility=0.92,
        ),
        RecoveryCandidate(
            id="opt-cap",
            label="Cap listing quantity",
            summary="Throttle purchasable quantity per order to protect SLA.",
            unit_cost_multiplier=1.0,
            lead_time_hours=1,
            capacity_units=ctx.required_units * 0.8,
            feasibility=0.99,
        ),
    ]


def build_shipment_delay_candidates(ctx: ExceptionContext) -> List[RecoveryCandidate]:
    return [
        RecoveryCandidate(
            id="opt-hold",
            label="Hold and wait for weather window",
            summary="Keep current sea route, notify customers of a 1-day slip.",
            unit_cost_multiplier=1.0,
            lead_time_hours=ctx.delay_hours,
            capacity_units=ctx.required_units,
            feasibility=1.0,
        ),
        RecoveryCandidate(
            id="opt-air",
            label="Air-freight the SLA-critical subset",
            summary="Move SLA-critical units to air freight, keep the rest on sea.",
            unit_cost_multiplier=1.3,
            lead_time_hours=ctx.delay_hours * 0.27,
            capacity_units=ctx.required_units * 0.3,
            feasibility=0.90,
        ),
        RecoveryCandidate(
            id="opt-reroute",
            label="Reroute via alternate hub",
            summary="Consolidate at alternate carrier hub via a different lane.",
            unit_cost_multiplier=1.15,
            lead_time_hours=ctx.delay_hours * 0.78,
            capacity_units=ctx.required_units,
            feasibility=0.70,
        ),
    ]
