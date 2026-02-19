"""
Smurfing detection service for RingBreaker.
"""

import pandas as pd
import networkx as nx
from typing import List, Dict, Any
from datetime import timedelta


def detect_smurfing(G: nx.DiGraph, df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Detect smurfing patterns in transaction data."""
    # Memory optimization: DO NOT copy the dataframe. 
    # Timestamps should be pre-converted in the router.
    results: List[Dict[str, Any]] = []

    for node in G.nodes():
        in_degree, out_degree = G.in_degree(node), G.out_degree(node)
        total_tx = in_degree + out_degree

        if total_tx > 100:
            continue

        received_amounts = [G[u][v]["amount"] for u, v in G.in_edges(node)]
        if received_amounts:
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
            sent_timestamps = [G[u][v]["timestamp"] for u, v in G.out_edges(node)]
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
                    "account_id": node,
                    "patterns": patterns,
                    "in_degree": in_degree,
                    "out_degree": out_degree,
                    "is_temporal": is_temporal,
                }
            )

        elif in_degree >= 10:
            received_timestamps = [G[u][v]["timestamp"] for u, v in G.in_edges(node)]
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
                    "account_id": node,
                    "patterns": patterns,
                    "in_degree": in_degree,
                    "out_degree": out_degree,
                    "is_temporal": is_temporal,
                }
            )

    return results
