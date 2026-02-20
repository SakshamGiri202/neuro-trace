import pandas as pd
import igraph as ig
from typing import List, Dict, Any
from datetime import timedelta


def detect_smurfing(g: ig.Graph, df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Detect smurfing patterns in transaction data using iGraph."""
    results: List[Dict[str, Any]] = []
    node_names = g.vs["name"]

    for i in range(g.vcount()):
        in_degree = g.indegree(i)
        out_degree = g.outdegree(i)
        total_tx = in_degree + out_degree

        if total_tx > 100:
            continue

        # Get amounts for incoming edges
        in_edges = g.incident(i, mode="in")
        if in_edges:
            received_amounts = g.es[in_edges]["amount"]
            mean_amount = sum(received_amounts) / len(received_amounts)
            if mean_amount > 0:
                std_dev = (
                    sum((x - mean_amount) ** 2 for x in received_amounts)
                    / len(received_amounts)
                ) ** 0.5
                if std_dev / mean_amount < 0.05:
                    continue

        patterns: List[str] = []
        is_temporal = False

        if out_degree >= 10:
            out_edges = g.incident(i, mode="out")
            sent_timestamps = pd.to_datetime(g.es[out_edges]["timestamp"])
            if len(sent_timestamps) >= 2:
                if max(sent_timestamps) - min(sent_timestamps) <= timedelta(hours=72):
                    patterns.append("fan_out_temporal")
                    is_temporal = True
                else:
                    patterns.append("fan_out")
            else:
                patterns.append("fan_out")
            results.append(
                {
                    "account_id": node_names[i],
                    "patterns": patterns,
                    "in_degree": in_degree,
                    "out_degree": out_degree,
                    "is_temporal": is_temporal,
                }
            )

        elif in_degree >= 10:
            in_edges = g.incident(i, mode="in")
            received_timestamps = pd.to_datetime(g.es[in_edges]["timestamp"])
            if len(received_timestamps) >= 2:
                if max(received_timestamps) - min(received_timestamps) <= timedelta(
                    hours=72
                ):
                    patterns.append("fan_in_temporal")
                    is_temporal = True
                else:
                    patterns.append("fan_in")
            else:
                patterns.append("fan_in")
            results.append(
                {
                    "account_id": node_names[i],
                    "patterns": patterns,
                    "in_degree": in_degree,
                    "out_degree": out_degree,
                    "is_temporal": is_temporal,
                }
            )

    return results
