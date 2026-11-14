from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from engine.replay import replay_events
from engine.branches import run_counterfactual
from engine.compare import compare_results


app = FastAPI(
    title="ChronoFork API",
    description="Counterfactual replay for serverless developers",
    version="0.1.0"
)


class ReplayRequest(BaseModel):
    events: list[dict[str, Any]]
    policy: str = "strict"


class ForkRequest(BaseModel):
    events: list[dict[str, Any]]
    mutations: list[dict[str, Any]] = Field(default_factory=list)
    branch_policy: str = "idempotent"


@app.get("/")
def home():
    return {
        "name": "ChronoFork",
        "message": "Counterfactual replay API is running",
        "version": "0.1.0"
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/replay")
def replay(request: ReplayRequest):
    try:
        return replay_events(request.events, request.policy)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/fork")
def fork(request: ForkRequest):
    try:
        return run_counterfactual(
            raw_events=request.events,
            mutations=request.mutations,
            branch_policy=request.branch_policy
        )
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/compare")
def compare(request: ForkRequest):
    try:
        result = run_counterfactual(
            raw_events=request.events,
            mutations=request.mutations,
            branch_policy=request.branch_policy
        )

        return compare_results(
            result["baseline"],
            result["counterfactual"]
        )
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
