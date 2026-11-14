
from copy import deepcopy
from engine.schema import Event


def initial_state(order_id: str) -> dict:
    """Create the initial state for an order."""

    return {
        "order_id": order_id,
        "status": "NOT_CREATED",
        "authorized_amount": 0,
        "refunded_amount": 0,
        "inventory_reserved": False,
        "processed_operations": [],
        "anomalies": []
    }


def apply_event(
    current_state: dict,
    event: Event,
    policy: str = "strict"
) -> dict:
    """
    Apply one event to an order state.

    strict:
        Apply repeated logical operations but flag them.

    idempotent:
        Skip repeated logical operations.
    """

    if policy not in ("strict", "idempotent"):
        raise ValueError("Policy must be strict or idempotent")

    state = deepcopy(current_state)

    processed = state["processed_operations"]
    operation_id = event.operation_id

    # Detect repeated logical operations.
    if operation_id in processed:
        anomaly = {
            "type": "DUPLICATE_OPERATION",
            "event_id": event.event_id,
            "operation_id": operation_id,
            "message": "This logical operation was already processed."
        }

        state["anomalies"].append(anomaly)

        if policy == "idempotent":
            return state

    else:
        processed.append(operation_id)

    event_type = event.event_type
    payload = event.payload

    if event_type == "ORDER_CREATED":

        if state["status"] != "NOT_CREATED":
            raise ValueError("Order has already been created")

        state["status"] = "CREATED"

    elif event_type == "PAYMENT_AUTHORIZED":

        if state["status"] not in ("CREATED", "PAID"):
            raise ValueError("Payment requires an active order")

        amount = payload.get("amount")

        if (
            isinstance(amount, bool)
            or not isinstance(amount, (int, float))
            or amount <= 0
        ):
            raise ValueError("Payment amount must be positive")

        state["authorized_amount"] += amount
        state["status"] = "PAID"

    elif event_type == "INVENTORY_RESERVED":

        if state["status"] not in ("CREATED", "PAID"):
            raise ValueError("Cannot reserve inventory for this order")

        if state["inventory_reserved"]:
            state["anomalies"].append({
                "type": "DUPLICATE_INVENTORY_RESERVATION",
                "event_id": event.event_id,
                "message": "Inventory was already reserved."
            })
        else:
            state["inventory_reserved"] = True

    elif event_type == "ORDER_CANCELLED":

        if state["status"] not in ("CREATED", "PAID"):
            raise ValueError("Cannot cancel this order")

        state["status"] = "CANCELLED"

    elif event_type == "REFUND_ISSUED":

        if state["status"] != "PAID":
            raise ValueError("Refund requires a paid order")

        amount = payload.get("amount")

        if (
            isinstance(amount, bool)
            or not isinstance(amount, (int, float))
            or amount <= 0
        ):
            raise ValueError("Refund amount must be positive")

        if state["refunded_amount"] + amount > state["authorized_amount"]:
            raise ValueError("Refund exceeds authorized amount")

        state["refunded_amount"] += amount

    else:
        raise ValueError(f"Unsupported event type: {event_type}")

    return state
