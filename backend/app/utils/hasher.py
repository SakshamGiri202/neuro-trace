"""
Hashing utilities for RingBreaker.
"""

import json
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any


def hash_report(report: Dict[str, Any]) -> str:
    """Generate SHA-256 hash of a report dictionary."""
    json_string = json.dumps(report, sort_keys=True)
    hash_object = hashlib.sha256(json_string.encode("utf-8"))
    return hash_object.hexdigest()


def get_timestamp() -> str:
    """Get current UTC time as ISO format string."""
    return datetime.now(timezone.utc).isoformat()
