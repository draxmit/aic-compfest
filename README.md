# AEO — AI Exception Orchestrator

**AI Innovation Challenge · COMPFEST 18 · Team cupuu (BINUS Data Science)**

> *"AI for the Backbone of the Economy"* — Smart Commerce & Smart Logistics

AEO is an AI-powered supply chain exception management system that automatically detects, quantifies, and resolves operational disruptions in real time, keeping human operators in the loop for every irreversible decision.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend (Vite + TanStack Router + ShadCN · port 3000)   │
│  Exception Queue → Detail → Approve → History                   │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST / JSON
┌────────────────────────▼────────────────────────────────────────┐
│  FastAPI Backend (Python 3.11 · port 8000)                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Isolation    │  │  LightGBM    │  │  OR-Tools CP-SAT     │  │
│  │ Forest       │→ │  SLA Breach  │→ │  Recovery Optimizer  │  │
│  │ (3 detectors)│  │  + Loss Reg  │  │  (exactly-one solver)│  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ACM — Autonomous Commerce Mitigation                    │   │
│  │  LightGBM churn model · CLV scoring · dynamic pricing   │   │
│  │  + Gemini Flash 2.0 (personalized retention message)    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                         │
              Olist Brazilian e-commerce dataset
              (96,475 orders · proxy for Indonesian patterns)
```

### AI Pipeline (4 stages)

| Stage | Model | Task | Output |
|-------|-------|------|--------|
| **Detect** | Isolation Forest (×3) | Anomaly scoring on order/supplier/shipment features | `anomaly_score`, `z_score`, `severity` |
| **Impact** | LightGBM binary + regressor | SLA breach probability + expected loss (IDR) | `sla_breach_prob`, `expected_loss_idr` |
| **Optimize** | OR-Tools CP-SAT | Minimize total cost subject to capacity/lead-time constraints | Ranked recovery options |
| **Mitigate** | LightGBM churn + Gemini Flash | Customer retention scoring + personalized apology message | Voucher tier, dynamic price, WA message |

---

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Add your Gemini API key (free tier: 1500 req/day)
cp .env.example .env
# Edit .env → GEMINI_API_KEY=your_key_here

# Train all 6 ML models on Olist data (one-time, ~60s)
python models/train.py

# Start API server
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
# From repo root
npm install        # or: bun install
npm run dev        # → http://localhost:5173
```

### 3. Docker Compose (recommended for judges)

```bash
# Copy .env.example → .env and fill GEMINI_API_KEY
cp backend/.env.example backend/.env

docker compose up --build
# Frontend → http://localhost:3000
# Backend  → http://localhost:8000
# API docs → http://localhost:8000/docs
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Optional | Google Gemini Flash 2.0 API key. If absent, falls back to structured templates. Free tier: 1500 req/day at [aistudio.google.com](https://aistudio.google.com). |

---

## Dataset

**Olist Brazilian E-Commerce** (public, Kaggle) — 96,475 orders, 8 CSVs.

Place raw CSVs in `backend/data/raw/olist/`:

```
olist_orders_dataset.csv
olist_order_items_dataset.csv
olist_order_payments_dataset.csv
olist_order_reviews_dataset.csv
olist_customers_dataset.csv
olist_sellers_dataset.csv
olist_products_dataset.csv
product_category_name_translation.csv
```

Features engineered: `delay_days`, `carrier_delay_days`, `sla_breach`, `order_value`, `purchase_hour/dow/month`, `clv_score`, `churn_risk_label`, seller reliability score.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Backend + model status |
| `POST` | `/api/detect` | Isolation Forest anomaly scoring |
| `POST` | `/api/impact` | LightGBM SLA breach + loss prediction |
| `POST` | `/api/optimize` | OR-Tools CP-SAT recovery options |
| `POST` | `/api/acm` | LightGBM churn score + voucher recommendation |
| `POST` | `/api/explain` | Gemini Flash explanation of AI recommendation |
| `POST` | `/api/acm/message` | Gemini Flash Indonesian customer apology message |
| `POST` | `/api/market-sentiment` | Disruption scope classification |
| `GET` | `/api/exceptions/demo` | Full pipeline for all 3 demo scenarios |

Interactive docs: `http://localhost:8000/docs`

---

## Project Structure

```
aic-compfest/
├── backend/
│   ├── main.py                 # FastAPI app + all endpoints
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   ├── data/
│   │   ├── pipeline.py         # Olist feature engineering
│   │   └── raw/olist/          # Raw CSV files (not committed)
│   └── models/
│       ├── anomaly.py          # Isolation Forest (3 detectors)
│       ├── impact.py           # LightGBM SLA breach + loss
│       ├── optimizer.py        # OR-Tools CP-SAT
│       ├── acm.py              # ACM churn + pricing
│       ├── llm.py              # Gemini Flash integration
│       ├── train.py            # One-time training script
│       └── artifacts/          # Saved .pkl model files
├── src/
│   ├── lib/
│   │   ├── api.ts              # Typed API client
│   │   ├── ops-data.ts         # Exception data + types
│   │   └── ops-store.tsx       # React context + localStorage
│   ├── routes/
│   │   ├── ai-operations.index.tsx          # Exception queue
│   │   ├── ai-operations.exceptions.$exceptionId.tsx  # Detail + ACM
│   │   └── ai-operations.history.tsx        # Decision log
│   └── components/ops/
│       └── AppShell.tsx        # Layout, Chip, SeverityDot
├── docker-compose.yml
├── Dockerfile.frontend
└── README.md
```

---

## Novelty Features

1. **Isolation Forest ensemble** — three separate detectors tuned to different signal types (demand velocity, supplier reliability, carrier delay patterns)
2. **OR-Tools CP-SAT optimizer** — exact solver with exactly-one recovery constraint; guarantees the recommended option is the global minimum-cost feasible solution
3. **ACM (Autonomous Commerce Mitigation)** — LightGBM churn model + CLV-tiered voucher system + dynamic logistics surcharge pricing
4. **Gemini Flash integration** — LLM generates: (a) 3-bullet English explanation of the AI recommendation, (b) personalized Indonesian WhatsApp apology message for affected customers; graceful template fallback when API unavailable
5. **Human-in-the-loop approval** — all recovery actions are simulated until a human explicitly approves; no ERP/WMS writes in the MVP

---

## Team

**cupuu** — BINUS University, Data Science

- Frederick Allensius
- Kang Nicholas Darren Nugroho
- Ivan William Lianata

---

## License

MIT
