"""
Graph building utilities for RingBreaker.
"""

import pandas as pd
import networkx as nx
from typing import Dict, Any


def build_graph(df: pd.DataFrame) -> nx.DiGraph:
    """Build a directed graph from transaction DataFrame."""
    G = nx.DiGraph()
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    for _, row in df.iterrows():
        sender, receiver = str(row["sender_id"]), str(row["receiver_id"])
        if sender not in G:
            G.add_node(sender)
        if receiver not in G:
            G.add_node(receiver)
        G.add_edge(
            sender,
            receiver,
            amount=row["amount"],
            timestamp=row["timestamp"],
            transaction_id=row["transaction_id"],
        )

    for node in G.nodes():
        total_sent = sum(G[u][v]["amount"] for u, v in G.out_edges(node))
        total_received = sum(G[u][v]["amount"] for u, v in G.in_edges(node))
        tx_count = G.in_degree(node) + G.out_degree(node)
        timestamps = []
        for u, v in G.out_edges(node):
            timestamps.append(G[u][v]["timestamp"])
        for u, v in G.in_edges(node):
            timestamps.append(G[u][v]["timestamp"])
        G.nodes[node].update(
            {
                "total_sent": total_sent,
                "total_received": total_received,
                "tx_count": tx_count,
                "first_seen": min(timestamps) if timestamps else None,
                "last_seen": max(timestamps) if timestamps else None,
            }
        )

    return G


def get_node_stats(G: nx.DiGraph, df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """Calculate statistics for each node in the graph."""
    stats: Dict[str, Dict[str, Any]] = {}
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    all_accounts = set(df["sender_id"].unique()).union(set(df["receiver_id"].unique()))

    for account in all_accounts:
        account = str(account)
        sent_txs = df[df["sender_id"] == account]
        received_txs = df[df["receiver_id"] == account]
        stats[account] = {
            "in_degree": G.in_degree(account),
            "out_degree": G.out_degree(account),
            "total_tx": G.in_degree(account) + G.out_degree(account),
            "total_sent": sent_txs["amount"].sum() if not sent_txs.empty else 0,
            "total_received": received_txs["amount"].sum()
            if not received_txs.empty
            else 0,
            "first_seen": pd.concat(
                [sent_txs["timestamp"], received_txs["timestamp"]]
            ).min()
            if not pd.concat([sent_txs["timestamp"], received_txs["timestamp"]]).empty
            else None,
            "last_seen": pd.concat(
                [sent_txs["timestamp"], received_txs["timestamp"]]
            ).max()
            if not pd.concat([sent_txs["timestamp"], received_txs["timestamp"]]).empty
            else None,
        }

    return stats
