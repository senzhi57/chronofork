# ChronoFork

ChronoFork replays an event history and lets you compare the original outcome with a counterfactual branch. It is designed for investigating duplicate deliveries and other failures in event-driven and serverless systems.

## What’s in the repository

- **FastAPI backend** — health, replay, fork, and comparison endpoints.
- **Replay engine** — validates and orders events, applies order state transitions, and records anomalies.
- **React + TypeScript frontend** — event timeline and JSON editor, replay policy controls, counterfactual mutations, and side-by-side state comparison.
- **Sample history** — `sample_data/duplicate_payment.json`, which contains a repeated payment operation.

## Requirements

- Python 3.10 or newer
- Node.js 20.19 or newer, or 22.12 or newer
- npm

## Run in GitHub Codespaces

Open two terminals at the repository root (`/workspaces/chronofork`). Keep both development servers running.

### 1. Start the API

If `.venv` does not exist yet, create it and activate it in the first terminal:

```bash
cd /workspaces/chronofork
python -m venv .venv
source .venv/bin/activate
```

Then install the backend dependencies and start the API in that terminal:

```bash
cd /workspaces/chronofork
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

FastAPI’s interactive API reference is available at the forwarded port **8000** URL with `/docs` appended. The health endpoint is `/health`.

### 2. Start the frontend

In the second terminal:

```bash
cd /workspaces/chronofork/frontend
npm install
npm run dev
```

Open the forwarded port **5173** URL. The frontend uses `/api` by default; Vite forwards those requests to `http://127.0.0.1:8000` from within the Codespace. In Codespaces, forward ports **5173** and **8000** and keep them private unless you specifically need public access.

For a backend at another address, set `VITE_API_PROXY_TARGET` in `frontend/.env.local`, or change the API base URL in the dashboard. Do not include `/api` in `VITE_API_PROXY_TARGET`; the Vite proxy adds the API routes after removing the `/api` prefix from browser requests.

## Use the replay lab

1. Select **Load demo dataset** to load the repository sample.
2. Choose a replay policy. `strict` applies repeated logical operations and reports them; `idempotent` reports duplicates and skips their state changes.
3. Click **Replay baseline** to run `POST /replay`, or add a branch mutation and click **Run counterfactual** to call `POST /fork` and `POST /compare`.
4. Review final states, anomaly details, and the state difference in the outcome panel.

With the included sample, strict replay authorizes ₹1,00,000 and records a duplicate-operation anomaly. An idempotent counterfactual authorizes ₹50,000 because it skips the repeated payment operation.

Events must be supplied as a JSON array. Each event needs `event_id`, `operation_id`, `timestamp` (ISO 8601 with timezone), `sequence`, `entity_id`, `event_type`, `source`, and an object-valued `payload`. The current replay engine supports one entity per history.

## API routes

| Method | Route | Request body | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Check API availability |
| `POST` | `/replay` | `{ "events": [], "policy": "strict" }` | Replay one event history |
| `POST` | `/fork` | `{ "events": [], "mutations": [], "branch_policy": "idempotent" }` | Run baseline and counterfactual histories |
| `POST` | `/compare` | Same as `/fork` | Return an outcome comparison |

The backend supports `remove`, `duplicate`, and `reorder` mutation objects. For example:

```json
{
  "type": "duplicate",
  "event_id": "evt_002",
  "new_event_id": "evt_005"
}
```

## Tests and production build

From the repository root, run the backend tests:

```bash
python -m pytest -q
```

Build the frontend from its directory:

```bash
cd frontend
npm run build
```

## Project status

The repository contains the local replay API and interactive frontend. AWS deployment is not configured by these development instructions.
