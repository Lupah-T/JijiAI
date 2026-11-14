# JijiAI — Intelligent Waste Assistant

This repository contains the JijiGreen AI project with an existing FastAPI backend, TensorFlow-based waste classification, experimental brand recognition, CSV-backed collection guidance, and a new Vite + React front-end demo experience.

## Project structure

- `api/brand_api.py` — FastAPI application with prediction endpoints and recommendation endpoints.
- `api/collection_recommender.py` — collection-point recommendation algorithm and dataset filtering.
- `data/` — circularity datasets used by the backend.
- `frontend/` — React + Vite demo app for the User and Collector portals.
- `models/` — material model + labels used by the backend.
- `experiments/brand_recognition/` — experimental brand model.
- `tests/` — existing Python test suite.

## Backend requirements

Use the Python virtual environment in `jijiAI/`.

```bash
cd /home/mk/Desktop/jijigreen-ai
source jijiAI/bin/activate
python -m uvicorn api.brand_api:app --host 0.0.0.0 --port 8000 --reload
```

## Frontend requirements

Use pnpm for package management.

```bash
cd /home/mk/Desktop/jijigreen-ai/frontend
cp .env.example .env
pnpm install
pnpm dev --host 0.0.0.0 --port 5173
```

## Frontend build

```bash
cd /home/mk/Desktop/jijigreen-ai/frontend
pnpm build
```

## Testing

```bash
cd /home/mk/Desktop/jijigreen-ai
source jijiAI/bin/activate
python -m unittest tests.test_collection_recommender -v
```

## Notes

- The backend is the source of truth for prediction endpoints and recommendation logic.
- Brand recognition remains experimental and human verification is required.
- Collection recommendations use the existing dataset and priority order from `api/collection_recommender.py`.
- Demo data is stored locally in the browser and is clearly labeled as demo-only.
