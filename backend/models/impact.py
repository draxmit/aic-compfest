"""
Impact Quantification — LightGBM models.
Predicts: SLA breach probability, expected financial loss, affected orders.
Trained on Olist order features.
"""

import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, mean_absolute_error
import joblib
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "artifacts"
MODEL_DIR.mkdir(exist_ok=True)

SLA_MODEL_PATH = MODEL_DIR / "sla_breach_lgbm.pkl"
LOSS_MODEL_PATH = MODEL_DIR / "expected_loss_lgbm.pkl"


SLA_FEATURES = [
    "delay_days",
    "carrier_delay_days",
    "item_count",
    "order_value",
    "purchase_hour",
    "purchase_dow",
    "purchase_month",
]

LOSS_FEATURES = [
    "delay_days",
    "carrier_delay_days",
    "item_count",
    "order_value",
    "purchase_hour",
    "purchase_dow",
]


class SLABreachModel:
    """LightGBM binary classifier: will this order breach SLA?"""

    def __init__(self):
        self.model: lgb.Booster | None = None
        self.feature_importance: dict = {}

    def fit(self, order_feats: pd.DataFrame):
        df = order_feats[SLA_FEATURES + ["sla_breach"]].dropna()
        X = df[SLA_FEATURES].values
        y = df["sla_breach"].values

        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

        train_ds = lgb.Dataset(X_train, label=y_train)
        val_ds = lgb.Dataset(X_val, label=y_val, reference=train_ds)

        params = {
            "objective": "binary",
            "metric": "auc",
            "learning_rate": 0.05,
            "num_leaves": 31,
            "feature_fraction": 0.8,
            "bagging_fraction": 0.8,
            "bagging_freq": 5,
            "verbose": -1,
            "n_jobs": -1,
        }

        self.model = lgb.train(
            params,
            train_ds,
            num_boost_round=300,
            valid_sets=[val_ds],
            callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(50)],
        )

        val_preds = self.model.predict(X_val)
        auc = roc_auc_score(y_val, val_preds)
        print(f"SLABreachModel — val AUC: {auc:.4f}")

        self.feature_importance = dict(zip(SLA_FEATURES, self.model.feature_importance(importance_type="gain")))
        joblib.dump(self.model, SLA_MODEL_PATH)

    def predict(self, features: dict) -> float:
        """Return SLA breach probability [0-1]."""
        if self.model is None:
            self.model = joblib.load(SLA_MODEL_PATH)
        X = np.array([[features.get(f, 0) for f in SLA_FEATURES]])
        return float(self.model.predict(X)[0])


class ExpectedLossModel:
    """LightGBM regressor: expected financial loss (in BRL, scaled to IDR later)."""

    BRL_TO_IDR = 3_000  # approximate conversion for demo

    def __init__(self):
        self.model: lgb.Booster | None = None

    def _compute_loss(self, df: pd.DataFrame) -> pd.Series:
        """
        Proxy loss = order_value * sla_penalty_multiplier.
        Penalty: 0 if on-time, 10-50% of order value if late.
        """
        loss = df["order_value"] * (df["delay_days"].clip(0) * 0.05).clip(0, 0.5)
        return loss

    def fit(self, order_feats: pd.DataFrame):
        needed = list(dict.fromkeys(LOSS_FEATURES + ["order_value", "delay_days", "sla_breach"]))
        df = order_feats[needed].dropna().copy()
        df = df[df["sla_breach"] == 1].copy()  # train on breached orders
        df["loss"] = df["order_value"] * (df["delay_days"].clip(0) * 0.05).clip(0, 0.5)

        X = df[LOSS_FEATURES].values
        y = df["loss"].values

        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

        train_ds = lgb.Dataset(X_train, label=y_train)
        val_ds = lgb.Dataset(X_val, label=y_val, reference=train_ds)

        params = {
            "objective": "regression_l1",
            "metric": "mae",
            "learning_rate": 0.05,
            "num_leaves": 31,
            "verbose": -1,
            "n_jobs": -1,
        }

        self.model = lgb.train(
            params,
            train_ds,
            num_boost_round=300,
            valid_sets=[val_ds],
            callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(50)],
        )

        val_preds = self.model.predict(X_val)
        mae = mean_absolute_error(y_val, val_preds)
        print(f"ExpectedLossModel — val MAE: {mae:.2f} BRL")
        joblib.dump(self.model, LOSS_MODEL_PATH)

    def predict_idr(self, features: dict, affected_orders: int, scale_factor: float = 1.0) -> float:
        """Return expected loss in IDR."""
        if self.model is None:
            self.model = joblib.load(LOSS_MODEL_PATH)
        X = np.array([[features.get(f, 0) for f in LOSS_FEATURES]])
        loss_per_order_brl = float(self.model.predict(X)[0])
        total_idr = loss_per_order_brl * affected_orders * self.BRL_TO_IDR * scale_factor
        # Round to nearest million
        return round(total_idr / 1_000_000) * 1_000_000
