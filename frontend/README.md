# ChronoFork frontend

## Run locally

Start the FastAPI service from the repository root in one terminal:

```bash
python -m pip install fastapi uvicorn
python -m uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

In a second terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL printed by the dev server (usually `http://localhost:5173`). The frontend uses `/api` by default, and Vite proxies those requests to `http://127.0.0.1:8000`. Set `VITE_API_PROXY_TARGET` in a `frontend/.env.local` file to proxy to a different backend host. The API base URL can also be changed in the dashboard and is saved in the current browser.

For a production frontend served on a different origin, configure a same-origin reverse proxy or enable the appropriate CORS origins in the API deployment.

## Production build

```bash
cd frontend
npm run build
npm run preview
```
