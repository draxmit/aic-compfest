"""
Olist → operational feature pipeline.
Produces the feature matrices our models consume.
"""

import pandas as pd
import numpy as np
from pathlib import Path

RAW = Path(__file__).parent / "raw" / "olist"


def load_raw():
    orders = pd.read_csv(RAW / "olist_orders_dataset.csv", parse_dates=[
        "order_purchase_timestamp",
        "order_approved_at",
        "order_delivered_carrier_date",
        "order_delivered_customer_date",
        "order_estimated_delivery_date",
    ])
    items = pd.read_csv(RAW / "olist_order_items_dataset.csv")
    sellers = pd.read_csv(RAW / "olist_sellers_dataset.csv")
    reviews = pd.read_csv(RAW / "olist_order_reviews_dataset.csv")
    payments = pd.read_csv(RAW / "olist_order_payments_dataset.csv")
    products = pd.read_csv(RAW / "olist_products_dataset.csv")
    return orders, items, sellers, reviews, payments, products


def build_order_features(orders: pd.DataFrame, items: pd.DataFrame, payments: pd.DataFrame) -> pd.DataFrame:
    """Per-order feature table for impact and SLA models."""
    df = orders.copy()

    # Delivery delay (actual - estimated)
    df["delay_days"] = (
        df["order_delivered_customer_date"] - df["order_estimated_delivery_date"]
    ).dt.total_seconds() / 86400

    # Carrier delay (delivered to carrier - approved)
    df["carrier_delay_days"] = (
        df["order_delivered_carrier_date"] - df["order_approved_at"]
    ).dt.total_seconds() / 86400

    # SLA breach: delivered later than estimated
    df["sla_breach"] = (df["delay_days"] > 0).astype(int)
    df["late"] = df["sla_breach"]  # alias

    # Order value
    value = payments.groupby("order_id")["payment_value"].sum().rename("order_value")
    df = df.join(value, on="order_id")

    # Item count
    item_count = items.groupby("order_id")["order_item_id"].max().rename("item_count")
    df = df.join(item_count, on="order_id")

    # Hour of purchase
    df["purchase_hour"] = df["order_purchase_timestamp"].dt.hour
    df["purchase_dow"] = df["order_purchase_timestamp"].dt.dayofweek
    df["purchase_month"] = df["order_purchase_timestamp"].dt.month

    df = df.dropna(subset=["delay_days", "order_value"])
    return df


def build_demand_timeseries(orders: pd.DataFrame, items: pd.DataFrame) -> pd.DataFrame:
    """Hourly/daily order velocity series for anomaly detection."""
    merged = orders.merge(items[["order_id", "product_id"]], on="order_id")
    merged["date"] = merged["order_purchase_timestamp"].dt.date
    merged["hour"] = merged["order_purchase_timestamp"].dt.hour

    # Daily velocity per product
    daily = (
        merged.groupby(["product_id", "date"])
        .size()
        .reset_index(name="order_count")
    )
    return daily


def build_seller_features(orders: pd.DataFrame, items: pd.DataFrame, sellers: pd.DataFrame) -> pd.DataFrame:
    """Per-seller reliability features (proxy for supplier delay model)."""
    merged = orders.merge(items[["order_id", "seller_id"]], on="order_id")

    # Delay per seller
    merged["delay_days"] = (
        merged["order_delivered_customer_date"] - merged["order_estimated_delivery_date"]
    ).dt.total_seconds() / 86400

    seller_stats = (
        merged.groupby("seller_id")
        .agg(
            order_count=("order_id", "count"),
            mean_delay=("delay_days", "mean"),
            std_delay=("delay_days", "std"),
            late_rate=("sla_breach", "mean") if "sla_breach" in merged.columns else ("delay_days", lambda x: (x > 0).mean()),
        )
        .reset_index()
    )
    # Reliability score (0-1, higher = more reliable)
    seller_stats["reliability"] = 1 - seller_stats["late_rate"].clip(0, 1)
    return seller_stats.merge(sellers, on="seller_id", how="left")


def build_customer_features(orders: pd.DataFrame, payments: pd.DataFrame, reviews: pd.DataFrame) -> pd.DataFrame:
    """Per-customer CLV and churn features for ACM model."""
    value = payments.groupby("order_id")["payment_value"].sum().reset_index()
    merged = orders.merge(value, on="order_id").merge(
        reviews[["order_id", "review_score"]].groupby("order_id")["review_score"].mean().reset_index(),
        on="order_id", how="left"
    )
    merged["delay_days"] = (
        merged["order_delivered_customer_date"] - merged["order_estimated_delivery_date"]
    ).dt.total_seconds() / 86400

    cust = (
        merged.groupby("customer_id")
        .agg(
            order_count=("order_id", "count"),
            total_spend=("payment_value", "sum"),
            avg_review=("review_score", "mean"),
            late_deliveries=("delay_days", lambda x: (x > 0).sum()),
        )
        .reset_index()
    )
    cust["clv_score"] = (
        np.log1p(cust["total_spend"]) * 0.6
        + cust["order_count"] * 0.3
        + cust["avg_review"].fillna(3) / 5 * 0.1
    )
    # Normalize
    cust["clv_score"] = (cust["clv_score"] - cust["clv_score"].min()) / (
        cust["clv_score"].max() - cust["clv_score"].min() + 1e-9
    )
    # Proxy: churn risk if avg review < 3 OR > 1 late delivery
    cust["churn_risk_label"] = (
        ((cust["avg_review"].fillna(4) < 3.5) | (cust["late_deliveries"] > 1)).astype(int)
    )
    return cust


if __name__ == "__main__":
    print("Loading Olist data...")
    orders, items, sellers, reviews, payments, products = load_raw()
    print(f"  Orders: {len(orders):,}")
    print(f"  Items:  {len(items):,}")
    print(f"  Sellers:{len(sellers):,}")

    print("\nBuilding order features...")
    order_feats = build_order_features(orders, items, payments)
    print(f"  Order features: {order_feats.shape}")

    print("Building demand time series...")
    demand_ts = build_demand_timeseries(orders, items)
    print(f"  Demand TS: {demand_ts.shape}")

    print("Building seller features...")
    seller_feats = build_seller_features(orders, items, sellers)
    print(f"  Seller features: {seller_feats.shape}")

    print("Building customer features...")
    cust_feats = build_customer_features(orders, payments, reviews)
    print(f"  Customer features: {cust_feats.shape}")

    print("\nAll pipelines OK.")
