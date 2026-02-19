"""
Graph building utilities for RingBreaker.
"""

import pandas as pd
import networkx as nx
from typing import Dict, Any


def build_graph(df: pd.DataFrame) -> nx.DiGraph:
    """
    Build a directed graph from transaction DataFrame.
    Memory optimization: Avoid df.copy() and iterrows().
    """
    G = nx.DiGraph()
    
    # Ensure columns are strings for IDs
    df["sender_id"] = df["sender_id"].astype(str)
    df["receiver_id"] = df["receiver_id"].astype(str)
    
    # Use itertuples() which is much faster than iterrows()
    for row in df.itertuples(index=False):
        G.add_edge(
            row.sender_id,
            row.receiver_id,
            amount=row.amount,
            timestamp=row.timestamp,
            transaction_id=row.transaction_id,
        )

    # Vectorized node stats calculation or using degree attributes directly
    for node in G.nodes():
        tx_count = G.in_degree(node) + G.out_degree(node)
        # We don't necessarily NEED to pre-summarize everything here if it's not used 
        # until the response phase. But let's keep it consistent but optimize.
        
        # Optimized timestamp gathering
        timestamps = [d["timestamp"] for _, _, d in G.out_edges(node, data=True)]
        timestamps.extend([d["timestamp"] for _, _, d in G.in_edges(node, data=True)])
        
        amounts_sent = [d["amount"] for _, _, d in G.out_edges(node, data=True)]
        amounts_received = [d["amount"] for _, _, d in G.in_edges(node, data=True)]
        
        G.nodes[node].update(
            {
                "total_sent": sum(amounts_sent),
                "total_received": sum(amounts_received),
                "tx_count": tx_count,
                "first_seen": min(timestamps) if timestamps else None,
                "last_seen": max(timestamps) if timestamps else None,
            }
        )

    return G


def get_node_stats(G: nx.DiGraph, df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """
    Calculate statistics for each node in the graph.
    Memory optimization: Use vectorized group-by operations.
    """
    stats: Dict[str, Dict[str, Any]] = {}

    # Calculate sent stats
    sent_stats = df.groupby("sender_id").agg({
        "amount": "sum",
        "timestamp": ["min", "max"]
    })
    sent_stats.columns = ["total_sent", "first_sent", "last_sent"]

    # Calculate received stats
    received_stats = df.groupby("receiver_id").agg({
        "amount": "sum",
        "timestamp": ["min", "max"]
    })
    received_stats.columns = ["total_received", "first_received", "last_received"]

    all_accounts = set(df["sender_id"].unique()).union(set(df["receiver_id"].unique()))

    for account in all_accounts:
        account_str = str(account)
        
        s_stats = sent_stats.loc[account] if account in sent_stats.index else None
        r_stats = received_stats.loc[account] if account in received_stats.index else None
        
        total_sent = s_stats["total_sent"] if s_stats is not None else 0
        total_received = r_stats["total_received"] if r_stats is not None else 0
        
        times = []
        if s_stats is not None:
            times.extend([s_stats["first_sent"], s_stats["last_sent"]])
        if r_stats is not None:
            times.extend([r_stats["first_received"], r_stats["last_received"]])
            
        valid_times = [t for t in times if pd.notnull(t)]

        stats[account_str] = {
            "in_degree": G.in_degree(account_str) if account_str in G else 0,
            "out_degree": G.out_degree(account_str) if account_str in G else 0,
            "total_tx": (G.in_degree(account_str) + G.out_degree(account_str)) if account_str in G else 0,
            "total_sent": float(total_sent),
            "total_received": float(total_received),
            "first_seen": min(valid_times) if valid_times else None,
            "last_seen": max(valid_times) if valid_times else None,
        }

    return stats
