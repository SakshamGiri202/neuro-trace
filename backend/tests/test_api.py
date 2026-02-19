"""
Tests for RingBreaker API.
"""

import io
from datetime import datetime, timedelta

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def df_to_bytesio(df: pd.DataFrame) -> io.BytesIO:
    """Convert DataFrame to BytesIO for file upload."""
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    csv_buffer.seek(0)
    return io.BytesIO(csv_buffer.getvalue().encode("utf-8"))


@pytest.fixture
def cycle_csv_data() -> pd.DataFrame:
    """Create a DataFrame with a known 3-node cycle."""
    data = {
        "transaction_id": ["TX001", "TX002", "TX003"],
        "sender_id": ["ACC_001", "ACC_002", "ACC_003"],
        "receiver_id": ["ACC_002", "ACC_003", "ACC_001"],
        "amount": [1000.0, 1500.0, 2000.0],
        "timestamp": [
            (datetime.now() - timedelta(hours=5)).isoformat(),
            (datetime.now() - timedelta(hours=3)).isoformat(),
            (datetime.now() - timedelta(hours=1)).isoformat(),
        ],
    }
    return pd.DataFrame(data)


@pytest.fixture
def smurfing_csv_data() -> pd.DataFrame:
    """Create a DataFrame with smurfing pattern (fan-out temporal)."""
    base_time = datetime.now() - timedelta(hours=12)
    transactions = []

    for i in range(15):
        transactions.append(
            {
                "transaction_id": f"TX_S{i:03d}",
                "sender_id": "ACC_010",
                "receiver_id": f"ACC_{11 + i:03d}",
                "amount": 500.0 + (i * 10),
                "timestamp": (base_time + timedelta(hours=i)).isoformat(),
            }
        )

    return pd.DataFrame(transactions)


@pytest.fixture
def mixed_csv_data(
    cycle_csv_data: pd.DataFrame, smurfing_csv_data: pd.DataFrame
) -> pd.DataFrame:
    """Create a DataFrame with both cycle and smurfing patterns."""
    combined = pd.concat([cycle_csv_data, smurfing_csv_data], ignore_index=True)
    return combined


def test_health():
    """Test GET /health returns 200 and status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "timestamp" in data


def test_upload_valid_csv(mixed_csv_data: pd.DataFrame):
    """Test POST /api/upload with valid CSV returns 200 and valid response."""
    csv_buffer = df_to_bytesio(mixed_csv_data)

    response = client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    assert response.status_code == 200
    data = response.json()

    assert "suspicious_accounts" in data
    assert "fraud_rings" in data
    assert "summary" in data
    assert isinstance(data["suspicious_accounts"], list)
    assert isinstance(data["fraud_rings"], list)


def test_upload_missing_columns():
    """Test POST /api/upload with missing columns returns 400."""
    invalid_data = pd.DataFrame(
        {
            "transaction_id": ["TX001"],
            "sender_id": ["ACC_001"],
        }
    )

    csv_buffer = df_to_bytesio(invalid_data)

    response = client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    assert response.status_code == 400


def test_upload_non_csv():
    """Test POST /api/upload with non-CSV file returns 400."""
    response = client.post(
        "/api/upload",
        files={"file": ("test.txt", b"not a csv", "text/plain")},
    )

    assert response.status_code == 400
    assert "Only CSV files are allowed" in response.json()["detail"]


def test_upload_detects_cycle(cycle_csv_data: pd.DataFrame):
    """Test POST /api/upload with cycle data detects at least 1 ring."""
    csv_buffer = df_to_bytesio(cycle_csv_data)

    response = client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["summary"]["fraud_rings_detected"] >= 1


def test_get_rings_after_upload(mixed_csv_data: pd.DataFrame):
    """Test GET /api/rings returns list after upload."""
    csv_buffer = df_to_bytesio(mixed_csv_data)

    client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    response = client.get("/api/rings")
    assert response.status_code == 200
    rings = response.json()
    assert isinstance(rings, list)


def test_get_ring_by_id(mixed_csv_data: pd.DataFrame):
    """Test GET /api/rings/RING_001 returns ring details."""
    csv_buffer = df_to_bytesio(mixed_csv_data)

    client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    response = client.get("/api/rings/RING_001")
    assert response.status_code == 200
    ring = response.json()
    assert "ring_id" in ring
    assert "member_accounts" in ring
    assert "pattern_type" in ring
    assert "risk_score" in ring


def test_get_account_details(mixed_csv_data: pd.DataFrame):
    """Test GET /api/accounts/{id} returns account details."""
    csv_buffer = df_to_bytesio(mixed_csv_data)

    client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    response = client.get("/api/accounts/ACC_001")
    assert response.status_code == 200
    account = response.json()
    assert account["account_id"] == "ACC_001"
    assert "suspicion_score" in account
    assert "detected_patterns" in account
    assert "ring_id" in account


def test_cycle_detection_details(cycle_csv_data: pd.DataFrame):
    """Test that ACC_001, ACC_002, ACC_003 are flagged with cycle_length_3."""
    csv_buffer = df_to_bytesio(cycle_csv_data)

    response = client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    assert response.status_code == 200
    data = response.json()

    suspicious_accounts = {
        acc["account_id"]: acc for acc in data["suspicious_accounts"]
    }

    assert "ACC_001" in suspicious_accounts
    assert "ACC_002" in suspicious_accounts
    assert "ACC_003" in suspicious_accounts

    for acc_id in ["ACC_001", "ACC_002", "ACC_003"]:
        assert "cycle_length_3" in suspicious_accounts[acc_id]["detected_patterns"]


def test_smurfing_detection_details(smurfing_csv_data: pd.DataFrame):
    """Test that ACC_010 has fan_out_temporal pattern."""
    csv_buffer = df_to_bytesio(smurfing_csv_data)

    response = client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    assert response.status_code == 200
    data = response.json()

    suspicious_accounts = {
        acc["account_id"]: acc for acc in data["suspicious_accounts"]
    }

    assert "ACC_010" in suspicious_accounts
    assert "fan_out_temporal" in suspicious_accounts["ACC_010"]["detected_patterns"]


def test_rings_endpoint_no_analysis():
    """Test GET /api/rings returns 404 when no analysis has been run."""
    from app.routers import upload

    upload.last_analysis_result = None

    response = client.get("/api/rings")
    assert response.status_code == 404


def test_ring_by_id_not_found():
    """Test GET /api/rings/{ring_id} returns 404 when ring not found."""
    from app.routers import upload

    upload.last_analysis_result = None

    response = client.get("/api/rings/RING_999")
    assert response.status_code == 404


def test_account_not_found():
    """Test GET /api/accounts/{id} returns 404 when account not found."""
    from app.routers import upload

    upload.last_analysis_result = None

    response = client.get("/api/accounts/NONEXISTENT")
    assert response.status_code == 404


def test_cytoscape_graph_after_upload(mixed_csv_data: pd.DataFrame):
    """Test GET /api/graph/cytoscape returns Cytoscape.js format."""
    csv_buffer = df_to_bytesio(mixed_csv_data)

    client.post(
        "/api/upload",
        files={"file": ("test.csv", csv_buffer, "text/csv")},
    )

    response = client.get("/api/graph/cytoscape")
    assert response.status_code == 200
    graph_data = response.json()

    assert "nodes" in graph_data
    assert "edges" in graph_data
    assert isinstance(graph_data["nodes"], list)
    assert isinstance(graph_data["edges"], list)

    suspicious_nodes = [
        n for n in graph_data["nodes"] if n["data"]["type"] == "suspicious"
    ]
    assert len(suspicious_nodes) > 0


def test_cytoscape_graph_no_analysis():
    """Test GET /api/graph/cytoscape returns 404 when no analysis."""
    from app.routers import upload

    upload.last_analysis_result = None
    upload.last_dataframe = None

    response = client.get("/api/graph/cytoscape")
    assert response.status_code == 404
