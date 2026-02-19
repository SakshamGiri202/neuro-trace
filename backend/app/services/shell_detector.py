"""
Shell account detection service for RingBreaker.
"""

import networkx as nx
from typing import List, Set, Any


def detect_shells(G: nx.DiGraph, df: Any = None) -> List[List[str]]:
    """Detect shell accounts and shell chains in the transaction graph."""
    shell_candidates = []

    for node in G.nodes():
        total_tx = G.in_degree(node) + G.out_degree(node)
        if (
            2 <= total_tx <= 4
            and G.in_degree(node) > 0
            and G.out_degree(node) > 0
            and list(G.successors(node))
        ):
            shell_candidates.append(node)

    shell_set = set(shell_candidates)
    chains: List[List[str]] = []
    visited = set()

    def find_chains_from_node(start_node: str, current_chain: List[str]) -> None:
        if start_node in visited and len(current_chain) > 0:
            return
        if len(current_chain) >= 3:
            chains.append(current_chain.copy())
        if len(current_chain) >= 5:
            return
        for successor in G.successors(start_node):
            if successor in shell_set:
                find_chains_from_node(successor, current_chain + [successor])

    for node in shell_candidates:
        if node not in visited:
            find_chains_from_node(node, [node])
            visited.add(node)

    return chains


def get_shell_accounts(shell_results: List[List[str]]) -> Set[str]:
    """Get all unique account IDs that appear in any shell chain."""
    account_set: Set[str] = set()
    for chain in shell_results:
        account_set.update(chain)
    return account_set
