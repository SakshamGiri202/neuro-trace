import pandas as pd
import igraph as ig
from typing import Dict, Any, List

def build_graph(df: pd.DataFrame) -> ig.Graph:
    """
    Build a directed graph from transaction DataFrame using iGraph.
    iGraph is much faster and more memory-efficient than NetworkX.
    """
    # Ensure IDs are strings
    df["sender_id"] = df["sender_id"].astype(str)
    df["receiver_id"] = df["receiver_id"].astype(str)
    
    # Get unique nodes
    unique_nodes = pd.unique(df[["sender_id", "receiver_id"]].values.ravel())
    node_to_idx = {node: i for i, node in enumerate(unique_nodes)}
    
    # Prepare edges for igraph
    # iGraph works best when creating the graph from an edge list with indices
    edges = []
    for row in df.itertuples(index=False):
        edges.append((node_to_idx[row.sender_id], node_to_idx[row.receiver_id]))
        
    g = ig.Graph(len(unique_nodes), edges, directed=True)
    g.vs["name"] = unique_nodes
    g.es["amount"] = df["amount"].tolist()
    g.es["timestamp"] = df["timestamp"].tolist()
    g.es["transaction_id"] = df["transaction_id"].tolist()
    
    # We can pre-calculate some stats if needed, but iGraph handles these efficiently via g.vs/g.es
    return g

def get_node_stats(g: ig.Graph, df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """
    Calculate statistics for each node using iGraph and Pandas.
    """
    stats: Dict[str, Dict[str, Any]] = {}
    
    # Grouped stats for efficiency
    sent_stats = df.groupby("sender_id").agg({
        "amount": "sum",
        "timestamp": ["min", "max"]
    })
    sent_stats.columns = ["total_sent", "first_sent", "last_sent"]

    received_stats = df.groupby("receiver_id").agg({
        "amount": "sum",
        "timestamp": ["min", "max"]
    })
    received_stats.columns = ["total_received", "first_received", "last_received"]

    for i, node_name in enumerate(g.vs["name"]):
        s_stats = sent_stats.loc[node_name] if node_name in sent_stats.index else None
        r_stats = received_stats.loc[node_name] if node_name in received_stats.index else None
        
        total_sent = float(s_stats["total_sent"]) if s_stats is not None else 0.0
        total_received = float(r_stats["total_received"]) if r_stats is not None else 0.0
        
        times = []
        if s_stats is not None:
            times.extend([s_stats["first_sent"], s_stats["last_sent"]])
        if r_stats is not None:
            times.extend([r_stats["first_received"], r_stats["last_received"]])
            
        valid_times = [t for t in times if pd.notnull(t)]

        stats[node_name] = {
            "in_degree": g.indegree(i),
            "out_degree": g.outdegree(i),
            "total_tx": g.degree(i),
            "total_sent": total_sent,
            "total_received": total_received,
            "first_seen": min(valid_times) if valid_times else None,
            "last_seen": max(valid_times) if valid_times else None,
        }

    return stats
