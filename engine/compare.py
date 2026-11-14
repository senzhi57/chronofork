
def compare_results(
    baseline: dict,
    counterfactual: dict
) -> dict:
    """Compare two independent replay results."""

    base_state = baseline["final_state"]
    fork_state = counterfactual["final_state"]

    fields = [
        "status",
        "authorized_amount",
        "refunded_amount",
        "inventory_reserved"
    ]

    differences = {}

    for field in fields:
        old = base_state[field]
        new = fork_state[field]

        if old != new:
            differences[field] = {
                "baseline": old,
                "counterfactual": new
            }

    amount_difference = (
        fork_state["authorized_amount"]
        - base_state["authorized_amount"]
    )

    return {
        "baseline_policy": baseline["policy"],
        "counterfactual_policy": counterfactual["policy"],
        "baseline_events": baseline["events_processed"],
        "counterfactual_events": counterfactual["events_processed"],
        "baseline_anomalies": baseline["anomaly_count"],
        "counterfactual_anomalies": counterfactual["anomaly_count"],
        "authorized_amount_difference": amount_difference,
        "differences": differences,
        "outcome_changed": bool(differences)
    }
