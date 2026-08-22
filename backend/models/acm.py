"""
Autonomous Commerce Mitigation (ACM) — XGBoost + LightGBM stacked.
Input: SLA breach prediction + customer CLV features.
Output: churn probability + recommended voucher/action.
"""

import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
import joblib
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "artifacts"
MODEL_DIR.mkdir(exist_ok=True)

CHURN_MODEL_PATH = MODEL_DIR / "acm_churn_lgbm.pkl"

CHURN_FEATURES = [
    "order_count",
    "total_spend_log",
    "avg_review",
    "late_deliveries",
    "clv_score",
]

# Voucher tiers (IDR)
VOUCHER_TIERS = [
    {"clv_min": 0.7, "voucher_idr": 50_000, "label": "Premium Apology Voucher"},
    {"clv_min": 0.4, "voucher_idr": 25_000, "label": "Standard Apology Voucher"},
    {"clv_min": 0.0, "voucher_idr": 10_000, "label": "Courtesy Voucher"},
]


class ChurnPredictionModel:
    """LightGBM binary: will this customer churn after a delivery failure?"""

    def __init__(self):
        self.model: lgb.Booster | None = None

    def fit(self, cust_feats: pd.DataFrame):
        df = cust_feats.copy()
        df["total_spend_log"] = np.log1p(df["total_spend"])
        df = df[CHURN_FEATURES + ["churn_risk_label"]].dropna()

        X = df[CHURN_FEATURES].values
        y = df["churn_risk_label"].values

        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

        train_ds = lgb.Dataset(X_train, label=y_train)
        val_ds = lgb.Dataset(X_val, label=y_val, reference=train_ds)

        params = {
            "objective": "binary",
            "metric": "auc",
            "learning_rate": 0.05,
            "num_leaves": 15,
            "verbose": -1,
            "n_jobs": -1,
        }

        self.model = lgb.train(
            params,
            train_ds,
            num_boost_round=200,
            valid_sets=[val_ds],
            callbacks=[lgb.early_stopping(20, verbose=False), lgb.log_evaluation(50)],
        )

        val_preds = self.model.predict(X_val)
        auc = roc_auc_score(y_val, val_preds)
        print(f"ChurnPredictionModel — val AUC: {auc:.4f}")
        joblib.dump(self.model, CHURN_MODEL_PATH)

    def predict(self, features: dict) -> float:
        if self.model is None:
            self.model = joblib.load(CHURN_MODEL_PATH)
        X = np.array([[features.get(f, 0) for f in CHURN_FEATURES]])
        return float(self.model.predict(X)[0])


def compute_acm_action(
    sla_breach_prob: float,
    affected_customers: int,
    avg_clv_score: float,
    high_clv_count: int,
    exception_type: str,
    delay_hours: float,
) -> dict:
    """
    Compute ACM recommendation:
    - Voucher tier based on CLV
    - Dynamic pricing uplift to cover logistics loss
    - Total expected churn cost vs. intervention cost
    """
    # Churn cost without intervention
    avg_order_value_idr = 500_000
    churn_cost = int(sla_breach_prob * affected_customers * avg_order_value_idr * 0.3)

    # Select voucher tier
    voucher = next(t for t in VOUCHER_TIERS if avg_clv_score >= t["clv_min"])
    intervention_cost = high_clv_count * voucher["voucher_idr"]

    # Dynamic pricing: raise ready-stock by 1-2% to cover logistics loss
    logistics_loss_margin = delay_hours * 50_000  # rough IDR per hour
    dynamic_price_pct = min(2.0, logistics_loss_margin / (affected_customers * avg_order_value_idr) * 100)

    return {
        "churn_probability": round(sla_breach_prob * 0.85, 2),  # conditional on SLA breach
        "customers_at_risk": affected_customers,
        "high_clv_customers": high_clv_count,
        "voucher_label": voucher["label"],
        "voucher_amount_idr": voucher["voucher_idr"],
        "total_intervention_cost_idr": intervention_cost,
        "churn_cost_without_action_idr": churn_cost,
        "net_benefit_idr": max(0, churn_cost - intervention_cost),
        "dynamic_pricing_uplift_pct": round(dynamic_price_pct, 1),
        "recommended_action": (
            f"Send {voucher['label']} (Rp{voucher['voucher_idr']:,}) "
            f"to {high_clv_count:,} High-CLV affected customers"
        ),
    }
