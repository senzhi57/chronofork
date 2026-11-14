
import pytest

from engine.schema import Event
from engine.validator import validate_events
from engine.reducer import initial_state, apply_event
from engine.replay import replay_events
from engine.mutations import apply_mutations
from engine.branches import run_counterfactual
from engine.compare import compare_results


def make_event(event_id, operation_id, sequence, event_type, payload=None):
    return {
        "event_id": event_id,
        "operation_id": operation_id,
        "timestamp": f"2026-11-13T10:0{sequence}:00Z",
        "sequence": sequence,
        "entity_id": "order_001",
        "event_type": event_type,
        "source": "test-service",
        "payload": payload or {}
    }


def sample_events():
    return [
        make_event("e1", "create_1", 1, "ORDER_CREATED"),
        make_event("e2", "payment_1", 2, "PAYMENT_AUTHORIZED",
                   {"amount": 50000}),
        make_event("e3", "payment_1", 3, "PAYMENT_AUTHORIZED",
                   {"amount": 50000}),
        make_event("e4", "inventory_1", 4, "INVENTORY_RESERVED")
    ]


def test_event_schema():
    event = Event.from_dict(make_event(
        "e1", "create_1", 1, "ORDER_CREATED"
    ))
    assert event.event_id == "e1"


def test_invalid_event_rejected():
    with pytest.raises(ValueError):
        Event.from_dict({})


def test_validator_orders_events():
    events = sample_events()[::-1]
    result = validate_events(events)
    assert [e.event_id for e in result] == ["e1", "e2", "e3", "e4"]


def test_validator_rejects_duplicate_ids():
    events = sample_events()
    events[1]["event_id"] = "e1"

    with pytest.raises(ValueError, match="Duplicate event ID"):
        validate_events(events)


def test_reducer_creates_order():
    event = Event.from_dict(
        make_event("e1", "create_1", 1, "ORDER_CREATED")
    )

    state = apply_event(initial_state("order_001"), event)

    assert state["status"] == "CREATED"


def test_replay_strict_policy():
    result = replay_events(sample_events(), "strict")

    assert result["events_processed"] == 4
    assert result["final_state"]["authorized_amount"] == 100000
    assert result["anomaly_count"] == 1


def test_replay_idempotent_policy():
    result = replay_events(sample_events(), "idempotent")

    assert result["final_state"]["authorized_amount"] == 50000
    assert result["anomaly_count"] == 1


def test_duplicate_mutation_preserves_original():
    original = sample_events()

    fork = apply_mutations(original, [{
        "type": "duplicate",
        "event_id": "e2",
        "new_event_id": "e5"
    }])

    assert len(original) == 4
    assert len(fork) == 5
    assert fork[-1]["operation_id"] == "payment_1"


def test_remove_mutation_preserves_original():
    original = sample_events()

    fork = apply_mutations(original, [{
        "type": "remove",
        "event_id": "e4"
    }])

    assert len(original) == 4
    assert len(fork) == 3


def test_counterfactual_branch():
    result = run_counterfactual(
        sample_events(),
        [],
        "idempotent"
    )

    assert result["baseline"]["final_state"]["authorized_amount"] == 100000
    assert result["counterfactual"]["final_state"]["authorized_amount"] == 50000


def test_comparison_engine():
    result = run_counterfactual(sample_events(), [], "idempotent")

    report = compare_results(
        result["baseline"],
        result["counterfactual"]
    )

    assert report["outcome_changed"] is True
    assert report["authorized_amount_difference"] == -50000
