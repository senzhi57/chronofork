
from copy import deepcopy


def apply_mutations(
    raw_events: list[dict],
    mutations: list[dict]
) -> list[dict]:
    """
    Create a modified event history without changing
    the original event history.

    Supported:
      - remove
      - duplicate
      - reorder
    """

    events = deepcopy(raw_events)

    for mutation in mutations:
        mutation_type = mutation.get("type")
        event_id = mutation.get("event_id")

        if mutation_type == "remove":
            events = [
                event for event in events
                if event["event_id"] != event_id
            ]

            if len(events) == 0:
                raise ValueError("Mutation removed every event")

        elif mutation_type == "duplicate":
            original = next(
                (e for e in events if e["event_id"] == event_id),
                None
            )

            if original is None:
                raise ValueError(f"Event not found: {event_id}")

            new_event = deepcopy(original)
            new_event["event_id"] = mutation["new_event_id"]

            # Keep the same operation_id to simulate
            # duplicate delivery of one logical operation.
            new_event["sequence"] = max(
                e["sequence"] for e in events
                if e["entity_id"] == original["entity_id"]
            ) + 1

            events.append(new_event)

        elif mutation_type == "reorder":
            target_id = mutation.get("before_event_id")

            first = next(
                (e for e in events if e["event_id"] == event_id),
                None
            )

            second = next(
                (e for e in events if e["event_id"] == target_id),
                None
            )

            if first is None or second is None:
                raise ValueError("Reorder event not found")

            if first["entity_id"] != second["entity_id"]:
                raise ValueError("Cannot reorder different entities")

            first["sequence"], second["sequence"] = (
                second["sequence"], first["sequence"]
            )

        else:
            raise ValueError(
                f"Unsupported mutation: {mutation_type}"
            )

    return events
