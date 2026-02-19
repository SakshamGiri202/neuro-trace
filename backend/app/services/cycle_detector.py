"""
Cycle detection service for RingBreaker.
"""

import networkx as nx
from typing import List, Set


def find_cycles(G: nx.DiGraph, max_length: int = 5) -> List[List[str]]:
    """
    Detect cycles in the transaction graph using a depth-limited DFS.
    This is much more efficient than nx.simple_cycles for short cycles.
    """
    cycles = []
    nodes = list(G.nodes())
    
    # Target specific lengths: 3, 4, 5
    for start_node in nodes:
        # Simple DFS to find cycles starting from start_node
        stack = [(start_node, [start_node])]
        while stack:
            current_node, path = stack.pop()
            
            if len(path) > max_length:
                continue
                
            for neighbor in G.successors(current_node):
                if neighbor == start_node:
                    if len(path) >= 3:
                        # Found a cycle!
                        # Normalize to avoid duplicates (sort and use as key)
                        # Actually simple_cycles handles this, we'll do a simple canonical form
                        canonical = tuple(sorted(path))
                        # We still need to check if we already found this cycle
                        cycles.append(path)
                elif neighbor not in path:
                    stack.append((neighbor, path + [neighbor]))
            
            if len(cycles) > 5000: # Practical limit
                break
        if len(cycles) > 5000:
            break
            
    # Remove duplicates (different start points of same cycle)
    unique_cycles = []
    seen = set()
    for cycle in cycles:
        canonical = tuple(sorted(cycle))
        if canonical not in seen:
            seen.add(canonical)
            unique_cycles.append(cycle)
            
    print(f"DEBUG: Found {len(unique_cycles)} unique cycles.")
    return unique_cycles


def get_cycle_accounts(cycles: List[List[str]]) -> Set[str]:
    """Get all unique account IDs that appear in any detected cycle."""
    account_set: Set[str] = set()
    for cycle in cycles:
        account_set.update(cycle)
    return account_set
