"""
LLM Integration — Google Gemini Flash 2.0 (free tier, 1500 req/day).
Used for:
  1. Dynamic recovery explanation generation
  2. ACM personalized customer apology message
  3. Competitor intelligence summary (market sentiment)
"""

import os
import json
import urllib.request
import urllib.error
from typing import Optional

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1/models/{GEMINI_MODEL}:generateContent"


def _call_gemini(prompt: str, temperature: float = 0.4) -> str:
    """
    Call Gemini Flash via REST (no SDK needed, zero additional dependencies).
    Falls back to a structured template if API key missing or quota exceeded.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return ""

    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": 2048},
    }).encode()

    req = urllib.request.Request(
        f"{GEMINI_URL}?key={api_key}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError, IndexError):
        return ""


def generate_recovery_explanation(
    exception_type: str,
    recommended_label: str,
    recommended_loss_idr: int,
    baseline_loss_idr: int,
    sla_risk: float,
    lead_time_hours: float,
    affected_orders: int,
    top_drivers: list[str],
) -> dict:
    """
    Generate a natural-language explanation of why the AI picked this recovery option.
    Returns {'bullets': [...], 'source': 'gemini'|'template'}.
    """
    loss_avoided = baseline_loss_idr - recommended_loss_idr
    prompt = f"""You are an AI operations advisor for an Indonesian supply chain company.
The AI optimizer has selected "{recommended_label}" as the best recovery action.

Exception type: {exception_type.replace('_', ' ')}
Selected option: {recommended_label}
Expected loss with action: Rp{recommended_loss_idr:,}
Baseline loss (do nothing): Rp{baseline_loss_idr:,}
Loss avoided: Rp{loss_avoided:,}
SLA breach risk: {sla_risk*100:.0f}%
Lead time: {lead_time_hours:.0f} hours
Affected orders: {affected_orders:,}
Key drivers: {', '.join(top_drivers)}

Write exactly 3 short sentences in English, one per line, numbered 1. 2. 3. explaining:
1. Why this option minimizes total cost compared to alternatives
2. How it reduces SLA breach risk
3. The top constraint or driver that made this the optimal choice

Output ONLY the 3 numbered sentences. No headers, no extra text."""

    raw = _call_gemini(prompt, temperature=0.3)
    if raw:
        import re
        lines = [ln.strip() for ln in raw.split("\n") if ln.strip()]
        bullets = [re.sub(r'^[\d]+[.)]\s*', '', ln) for ln in lines if ln][:3]
        bullets = [b for b in bullets if len(b) > 20]
        if len(bullets) >= 2:
            return {"bullets": bullets, "source": "gemini", "model": GEMINI_MODEL}

    # Structured fallback
    return {
        "bullets": [
            f"{recommended_label} minimizes expected total cost at Rp{recommended_loss_idr:,} versus the Rp{baseline_loss_idr:,} do-nothing baseline, saving Rp{loss_avoided:,}.",
            f"SLA breach probability drops to {sla_risk*100:.0f}% because the {lead_time_hours:.0f}h lead time restores the production window before the critical fulfillment cutoff.",
            f"Top driver: {top_drivers[0] if top_drivers else 'exception severity'} — optimizer confirmed capacity constraints are met and feasibility check passed.",
        ],
        "source": "template",
        "model": None,
    }


def generate_acm_customer_message(
    exception_type: str,
    delay_hours: float,
    voucher_amount_idr: int,
    brand_name: str = "Nusantara Seller",
    customer_segment: str = "High-CLV",
) -> dict:
    """
    Generate a personalized customer apology message (WhatsApp/email ready).
    This is the ACM novelty feature: LLM-crafted retention message.
    """
    delay_desc = f"{int(delay_hours)} hours" if delay_hours < 48 else f"{delay_hours/24:.0f} days"
    exc_label = exception_type.replace("_", " ")

    prompt = f"""You are a customer success manager at {brand_name}, an Indonesian e-commerce platform.
A {exc_label} has caused a delivery delay of approximately {delay_desc} for {customer_segment} customers.
You are composing a WhatsApp message to send to affected customers offering an apology voucher.

Write a short, warm, professional apology message in Indonesian (Bahasa Indonesia) that:
1. Briefly acknowledges the delay without technical details
2. Expresses genuine apology
3. Offers a Rp{voucher_amount_idr:,} voucher as compensation
4. Ends with a positive, forward-looking note

Keep it under 5 sentences. Friendly, not robotic. Start with "Halo [Nama],"
Do NOT include placeholder text. Write it as a ready-to-send message."""

    raw = _call_gemini(prompt, temperature=0.7)
    if raw and len(raw) > 30:
        return {
            "message": raw,
            "source": "gemini",
            "model": GEMINI_MODEL,
            "language": "id",
            "voucher_idr": voucher_amount_idr,
        }

    # Fallback template in Indonesian
    return {
        "message": (
            f"Halo [Nama], kami mohon maaf atas keterlambatan pengiriman pesanan Anda yang disebabkan oleh "
            f"gangguan operasional. Sebagai bentuk permintaan maaf kami, kami memberikan voucher senilai "
            f"Rp{voucher_amount_idr:,} yang dapat digunakan pada pembelian berikutnya. "
            f"Kami berkomitmen untuk terus meningkatkan layanan kami. Terima kasih atas kepercayaan Anda kepada {brand_name}."
        ),
        "source": "template",
        "model": None,
        "language": "id",
        "voucher_idr": voucher_amount_idr,
    }


def generate_market_sentiment(exception_type: str, severity: str) -> dict:
    """
    Competitor-Aware Dynamic Sourcing: is this a local disruption or industry-wide crisis?
    Returns a brief market intelligence summary.
    """
    prompt = f"""You are a supply chain intelligence analyst in Indonesia.
A "{exception_type.replace('_', ' ')}" has been detected with severity "{severity}".

In 2 sentences, assess: Is this likely a local/isolated disruption or an industry-wide crisis?
Mention 1 specific factor that would indicate the scope (e.g. weather, port congestion, commodity shortage).
Write in English. Be concise and analytical."""

    raw = _call_gemini(prompt, temperature=0.4)
    scope = "local"
    if raw and any(w in raw.lower() for w in ["industry", "widespread", "global", "multiple"]):
        scope = "industry-wide"

    return {
        "scope": scope,
        "summary": raw if raw else f"Monitoring indicates this is a {scope} disruption. Recommend aggressive sourcing if industry-wide patterns emerge.",
        "source": "gemini" if raw else "template",
        "model": GEMINI_MODEL if raw else None,
    }
