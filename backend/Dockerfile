FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-train models if artifacts are missing
RUN python -c "from pathlib import Path; import sys; \
    sys.exit(0) if (Path('models/artifacts/sla_breach_lgbm.pkl')).exists() else None" \
    || python models/train.py

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
