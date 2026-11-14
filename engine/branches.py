
from copy import deepcopy

from engine.replay import replay_events
from engine.mutations import apply_mutations


def run_counterfactual(
    raw_events: list[dict],
    mutations: list[dict] | None = None,
    branch_policy: str = "idempotent"
) -> dict:
    """
    Execute a baseline and an isolated counterfactual branch.
    """

    # Preserve original input.
    original_events = deepcopy(raw_events)

    # Execute original timeline.
    baseline = replay_events(
        original_events,
        policy="strict"
    )

    # Create an independent alternative timeline.
    branch_events = apply_mutations(
        original_events,
        mutations or []
    )

    # Execute alternative timeline independently.
    branch = replay_events(
        branch_events,
        policy=branch_policy
    )

    baseline_state = baseline["final_state"]
    branch_state = branch["final_state"]

    # Compare important state fields.
    fields = [
        "status",
        "authorized_amount",
        "refunded_amount",
        "inventory_reserved"
    ]

    differences = {}

    for field in fields:
        old_value = baseline_state[field]
        new_value = branch_state[field]

        if old_value != new_value:
            differences[field] = {
                "baseline": old_value,
                "counterfactual": new_value
            }

    return {
        "baseline": baseline,
        "counterfactual": branch,
        "mutations": mutations or [],
        "differences": differences,
        "baseline_anomalies": baseline["anomaly_count"],
        "counterfactual_anomalies": branch["anomaly_count"]
    }
