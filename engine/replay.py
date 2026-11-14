
from copy import deepcopy

from engine.validator import validate_events
from engine.reducer import initial_state, apply_event


def replay_events(
    raw_events: list[dict],
    policy: str = "strict"
) -> dict:
    """
    Replay a complete event history deterministically.
    """

    events = validate_events(raw_events)

    if policy not in ("strict", "idempotent"):
        raise ValueError("Invalid replay policy")

    # Start with a fresh state for each replay.
    order_ids = {event.entity_id for event in events}

    if len(order_ids) != 1:
        raise ValueError(
            "MVP replay supports one order entity per history"
        )

    order_id = next(iter(order_ids))
    state = initial_state(order_id)

    history = []

    for event in events:
        state = apply_event(state, event, policy)

        history.append({
            "event_id": event.event_id,
            "event_type": event.event_type,
            "state": deepcopy(state)
        })

    return {
        "policy": policy,
        "events_processed": len(events),
        "final_state": state,
        "history": history,
        "anomaly_count": len(state["anomalies"])
    }
