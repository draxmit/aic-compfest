"""
Train all models on Olist data.
Run once: python -m models.train
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from data.pipeline import (
    load_raw,
    build_order_features,
    build_demand_timeseries,
    build_seller_features,
    build_customer_features,
)
from models.anomaly import DemandSpikeDetector, SupplierDelayDetector, ShipmentDelayDetector
from models.impact import SLABreachModel, ExpectedLossModel
from models.acm import ChurnPredictionModel


def main():
    print("=" * 60)
    print("AI Exception Orchestrator — Model Training")
    print("=" * 60)

    print("\n[1/3] Loading and processing Olist data...")
    orders, items, sellers, reviews, payments, products = load_raw()

    order_feats = build_order_features(orders, items, payments)
    demand_ts = build_demand_timeseries(orders, items)
    seller_feats = build_seller_features(orders, items, sellers)
    cust_feats = build_customer_features(orders, payments, reviews)

    print(f"  Orders processed: {len(order_feats):,}")
    print(f"  Demand time series rows: {len(demand_ts):,}")
    print(f"  Sellers: {len(seller_feats):,}")
    print(f"  Customers: {len(cust_feats):,}")

    print("\n[2/3] Training anomaly detectors...")
    demand_detector = DemandSpikeDetector()
    demand_detector.fit(demand_ts)

    supplier_detector = SupplierDelayDetector()
    supplier_detector.fit(seller_feats)

    shipment_detector = ShipmentDelayDetector()
    shipment_detector.fit(order_feats)

    print("\n[3/3] Training impact + ACM models...")
    sla_model = SLABreachModel()
    sla_model.fit(order_feats)

    loss_model = ExpectedLossModel()
    loss_model.fit(order_feats)

    churn_model = ChurnPredictionModel()
    churn_model.fit(cust_feats)

    print("\n" + "=" * 60)
    print("All models trained and saved to backend/models/artifacts/")
    print("=" * 60)


if __name__ == "__main__":
    main()
