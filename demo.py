
import json
from pathlib import Path

from engine.branches import run_counterfactual
from engine.compare import compare_results


def get_anomalies(replay_result):
    """Read anomalies from the replay result or its final state."""
    anomalies = replay_result.get("anomalies")

    if anomalies is None:
        anomalies = replay_result.get(
            "final_state", {}
        ).get("anomalies", [])

    return anomalies or []


def main():
    dataset = Path("sample_data/duplicate_payment.json")

    if not dataset.exists():
        print(f"Dataset not found: {dataset}")
        return

    with dataset.open("r", encoding="utf-8") as file:
        events = json.load(file)

    print("\n" + "=" * 55)
    print("                    CHRONOFORK")
    print("             COUNTERFACTUAL REPLAY")
    print("=" * 55)

    print(f"\nEvents loaded: {len(events)}")

    # Run baseline and counterfactual replay.
    result = run_counterfactual(
        raw_events=events,
        mutations=[],
        branch_policy="idempotent"
    )

    baseline = result["baseline"]
    counterfactual = result["counterfactual"]

    baseline_state = baseline["final_state"]
    counterfactual_state = counterfactual["final_state"]

    # Generate comparison report.
    report = compare_results(baseline, counterfactual)

    # Display replay results.
    print("\n--- REPLAY RESULTS ---")

    print(
        f"Baseline authorized amount:       "
        f"₹{baseline_state['authorized_amount']:,}"
    )

    print(
        f"Counterfactual authorized amount:  "
        f"₹{counterfactual_state['authorized_amount']:,}"
    )

    # Display detected anomalies.
    print("\n--- ANOMALY DETECTION ---")

    anomalies = get_anomalies(baseline)

    if anomalies:
        for index, anomaly in enumerate(anomalies, start=1):
            print(f"\nAnomaly {index}")
            print(f"Type: {anomaly.get('type', 'UNKNOWN')}")
            print(f"Event: {anomaly.get('event_id', 'N/A')}")
            print(
                f"Operation: {anomaly.get('operation_id', 'N/A')}"
            )
            print(
                f"Details: {anomaly.get('message', 'No details')}"
            )
    else:
        print("No anomalies detected.")

    # Display comparison.
    print("\n--- COUNTERFACTUAL COMPARISON ---")

    difference = report["authorized_amount_difference"]

    print(f"Authorized amount difference: ₹{difference:,}")
    print(f"Outcome changed: {report['outcome_changed']}")

    if report["differences"]:
        print("\nState differences:")

        for field, values in report["differences"].items():
            print(f"\n{field}")
            print(f"  Baseline:       {values['baseline']}")
            print(f"  Counterfactual: {values['counterfactual']}")

    # Explain the result.
    print("\n--- INTERPRETATION ---")

    print(
        "The strict replay processes the repeated payment "
        "operation twice."
    )

    print(
        "The idempotent replay recognizes the duplicate logical "
        "operation and prevents the second amount from being added."
    )

    print(
        "\nRecommendation: Implement idempotency protection "
        "in the payment event handler."
    )

    print("\n" + "=" * 55)
    print("              CHRONOFORK DEMO COMPLETED")
    print("=" * 55 + "\n")


if __name__ == "__main__":
    main()
