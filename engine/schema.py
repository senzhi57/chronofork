
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class Event:
    event_id: str
    operation_id: str
    timestamp: str
    sequence: int
    entity_id: str
    event_type: str
    source: str
    payload: dict[str, Any]

    @classmethod
    def from_dict(cls, data: dict) -> "Event":
        required_fields = [
            "event_id",
            "operation_id",
            "timestamp",
            "sequence",
            "entity_id",
            "event_type",
            "source",
            "payload",
        ]

        for field in required_fields:
            if field not in data:
                raise ValueError(f"Missing required field: {field}")

        string_fields = [
            "event_id",
            "operation_id",
            "timestamp",
            "entity_id",
            "event_type",
            "source",
        ]

        for field in string_fields:
            if not isinstance(data[field], str) or not data[field].strip():
                raise ValueError(f"{field} must be a non-empty string")

        if isinstance(data["sequence"], bool) or not isinstance(data["sequence"], int):
            raise ValueError("sequence must be an integer")

        if data["sequence"] < 0:
            raise ValueError("sequence cannot be negative")

        if not isinstance(data["payload"], dict):
            raise ValueError("payload must be a dictionary")

        try:
            datetime.fromisoformat(
                data["timestamp"].replace("Z", "+00:00")
            )
        except ValueError:
            raise ValueError("timestamp must be a valid ISO 8601 timestamp")

        return cls(**{field: data[field] for field in required_fields})

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "operation_id": self.operation_id,
            "timestamp": self.timestamp,
            "sequence": self.sequence,
            "entity_id": self.entity_id,
            "event_type": self.event_type,
            "source": self.source,
            "payload": self.payload,
        }
