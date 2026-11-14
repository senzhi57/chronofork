
from datetime import datetime, timezone
from engine.schema import Event


def validate_events(raw_events: list[dict]) -> list[Event]:
    """Validate and consistently order an event history."""

    if not isinstance(raw_events, list):
        raise ValueError("Event history must be a list")

    if not raw_events:
        raise ValueError("Event history cannot be empty")

    events = []
    seen_event_ids = set()
    seen_sequences = set()

    for index, raw_event in enumerate(raw_events):
        try:
            event = Event.from_dict(raw_event)
        except (ValueError, TypeError) as error:
            raise ValueError(
                f"Invalid event at position {index}: {error}"
            ) from error

        if event.event_id in seen_event_ids:
            raise ValueError(
                f"Duplicate event ID: {event.event_id}"
            )

        seen_event_ids.add(event.event_id)

        sequence_key = (event.entity_id, event.sequence)

        if sequence_key in seen_sequences:
            raise ValueError(
                f"Duplicate sequence {event.sequence} "
                f"for entity {event.entity_id}"
            )

        seen_sequences.add(sequence_key)

        timestamp = datetime.fromisoformat(
            event.timestamp.replace("Z", "+00:00")
        )

        if timestamp.tzinfo is None:
            raise ValueError(
                f"Timestamp must include timezone: {event.event_id}"
            )

        events.append((event, timestamp.astimezone(timezone.utc)))

    events.sort(
        key=lambda item: (
            item[0].sequence,
            item[1],
            item[0].event_id
        )
    )

    return [event for event, timestamp in events]
