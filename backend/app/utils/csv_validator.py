"""
CSV validation utilities for RingBreaker.
"""

import pandas as pd
from typing import Dict, List, Any


def validate_csv(df: pd.DataFrame) -> Dict[str, Any]:
    """Validate a pandas DataFrame containing transaction data."""
    errors: List[str] = []
    warnings: List[str] = []

    required_columns = [
        "transaction_id",
        "sender_id",
        "receiver_id",
        "amount",
        "timestamp",
    ]

    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        errors.append(f"Missing required columns: {', '.join(missing_columns)}")
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "row_count": 0,
            "account_count": 0,
        }

    row_count = len(df)
    if row_count == 0:
        errors.append("CSV file is empty - no data rows found")
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "row_count": 0,
            "account_count": 0,
        }

    for col in required_columns:
        null_count = df[col].isnull().sum()
        if null_count > 0:
            errors.append(f"Column '{col}' contains {null_count} null values")

    if not pd.api.types.is_numeric_dtype(df["amount"]):
        errors.append("Column 'amount' must be numeric")

    try:
        pd.to_datetime(df["timestamp"])
    except Exception:
        errors.append("Column 'timestamp' could not be parsed as datetime")

    duplicate_transaction_ids = df["transaction_id"].duplicated().sum()
    if duplicate_transaction_ids > 0:
        warnings.append(
            f"Found {duplicate_transaction_ids} duplicate transaction_id values"
        )

    unique_senders = set(df["sender_id"].unique())
    unique_receivers = set(df["receiver_id"].unique())
    account_count = len(unique_senders.union(unique_receivers))

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "row_count": row_count,
        "account_count": account_count,
    }
