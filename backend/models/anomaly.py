"""
Exception Detector — Isolation Forest + rule-based hybrid.
Detects supplier delays, demand spikes, and shipment delays from operational features.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "artifacts"
MODEL_DIR.mkdir(exist_ok=True)


class DemandSpikeDetector:
    """Isolation Forest on rolling demand velocity features."""

    def __init__(self, contamination: float = 0.05):
        self.scaler = StandardScaler()
        self.model = IsolationForest(
            n_estimators=200,
            contamination=contamination,
            random_state=42,
        )
        self.fitted = False

    def _extract_features(self, daily: pd.DataFrame) -> pd.DataFrame:
        """Build rolling statistical features per product."""
        feats = []
        for pid, grp in daily.groupby("product_id"):
            grp = grp.sort_values("date").copy()
            grp["rolling_mean_7d"] = grp["order_count"].rolling(7, min_periods=1).mean()
            grp["rolling_std_7d"] = grp["order_count"].rolling(7, min_periods=1).std().fillna(1)
            grp["z_score"] = (grp["order_count"] - grp["rolling_mean_7d"]) / (grp["rolling_std_7d"] + 1e-9)
            grp["product_id"] = pid
            feats.append(grp)
        return pd.concat(feats, ignore_index=True)

    def fit(self, daily: pd.DataFrame):
        feat_df = self._extract_features(daily)
        X = feat_df[["order_count", "rolling_mean_7d", "rolling_std_7d", "z_score"]].fillna(0).values
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled)
        self.fitted = True
        joblib.dump((self.scaler, self.model), MODEL_DIR / "demand_anomaly.pkl")
        print(f"DemandSpikeDetector fitted on {len(X):,} samples")

    def score(self, order_count: float, rolling_mean: float, rolling_std: float) -> dict:
        """Score a single observation. Returns anomaly_score [0-1] and z_score."""
        if not self.fitted:
            self._load()
        z = (order_count - rolling_mean) / (rolling_std + 1e-9)
        X = np.array([[order_count, rolling_mean, rolling_std, z]])
        X_scaled = self.scaler.transform(X)
        # Isolation Forest: -1=anomaly, 1=normal; decision_function: lower=more anomalous
        raw_score = self.model.decision_function(X_scaled)[0]
        # Map to [0,1] where 1 = most anomalous
        anomaly_prob = 1 / (1 + np.exp(raw_score * 3))
        return {
            "anomaly_score": float(anomaly_prob),
            "z_score": float(z),
            "is_anomaly": bool(anomaly_prob > 0.6),
        }

    def _load(self):
        self.scaler, self.model = joblib.load(MODEL_DIR / "demand_anomaly.pkl")
        self.fitted = True


class SupplierDelayDetector:
    """Rule-based hybrid: z-score on lead time + Isolation Forest on seller history."""

    def __init__(self, contamination: float = 0.1):
        self.scaler = StandardScaler()
        self.model = IsolationForest(
            n_estimators=150,
            contamination=contamination,
            random_state=42,
        )
        self.fitted = False

    def fit(self, seller_feats: pd.DataFrame):
        cols = ["order_count", "mean_delay", "std_delay", "reliability"]
        X = seller_feats[cols].fillna(0).values
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled)
        self.fitted = True
        joblib.dump((self.scaler, self.model), MODEL_DIR / "supplier_anomaly.pkl")
        # Store stats for z-score
        self.lead_time_mean = seller_feats["mean_delay"].mean()
        self.lead_time_std = seller_feats["mean_delay"].std()
        joblib.dump(
            {"lead_time_mean": self.lead_time_mean, "lead_time_std": self.lead_time_std},
            MODEL_DIR / "supplier_stats.pkl",
        )
        print(f"SupplierDelayDetector fitted on {len(X):,} sellers")

    def score(self, predicted_delay_hours: float, historical_mean_days: float,
              historical_std_days: float, reliability: float) -> dict:
        if not self.fitted:
            self._load()
        delay_days = predicted_delay_hours / 24
        z = (delay_days - historical_mean_days) / (historical_std_days + 0.1)
        X = np.array([[10, delay_days, historical_std_days, reliability]])
        X_scaled = self.scaler.transform(X)
        raw_score = self.model.decision_function(X_scaled)[0]
        anomaly_prob = 1 / (1 + np.exp(raw_score * 3))
        # Blend IF score with rule-based z-score
        rule_score = min(max((z - 1) / 4, 0), 1)  # z>1 → starts flagging
        severity_score = 0.5 * anomaly_prob + 0.5 * rule_score
        return {
            "anomaly_score": float(severity_score),
            "z_score": float(z),
            "predicted_delay_hours": predicted_delay_hours,
            "is_anomaly": bool(severity_score > 0.5),
        }

    def _load(self):
        self.scaler, self.model = joblib.load(MODEL_DIR / "supplier_anomaly.pkl")
        stats = joblib.load(MODEL_DIR / "supplier_stats.pkl")
        self.lead_time_mean = stats["lead_time_mean"]
        self.lead_time_std = stats["lead_time_std"]
        self.fitted = True


class ShipmentDelayDetector:
    """Isolation Forest on order-level delivery features."""

    def __init__(self, contamination: float = 0.1):
        self.scaler = StandardScaler()
        self.model = IsolationForest(
            n_estimators=150,
            contamination=contamination,
            random_state=42,
        )
        self.fitted = False

    def fit(self, order_feats: pd.DataFrame):
        cols = ["carrier_delay_days", "item_count", "order_value"]
        df = order_feats[cols].dropna()
        X = df.values
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled)
        self.fitted = True
        joblib.dump((self.scaler, self.model), MODEL_DIR / "shipment_anomaly.pkl")
        print(f"ShipmentDelayDetector fitted on {len(X):,} orders")

    def score(self, carrier_delay_days: float, item_count: int, order_value: float) -> dict:
        if not self.fitted:
            self._load()
        X = np.array([[carrier_delay_days, item_count, order_value]])
        X_scaled = self.scaler.transform(X)
        raw_score = self.model.decision_function(X_scaled)[0]
        anomaly_prob = 1 / (1 + np.exp(raw_score * 3))
        return {
            "anomaly_score": float(anomaly_prob),
            "eta_drift_hours": carrier_delay_days * 24,
            "is_anomaly": bool(anomaly_prob > 0.55),
        }

    def _load(self):
        self.scaler, self.model = joblib.load(MODEL_DIR / "shipment_anomaly.pkl")
        self.fitted = True
