import time
import pandas as pd
import igraph as ig
import gc
from io import BytesIO
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from django.core.files.uploadhandler import MemoryFileUploadHandler
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser

# Use the existing services (refactored to igraph)
from app.utils.csv_validator import validate_csv
from app.utils.hasher import hash_report, get_timestamp
from app.services.graph_builder import build_graph, get_node_stats
from app.services.cycle_detector import find_cycles, get_cycle_accounts
from app.services.smurfing import detect_smurfing
from app.services.shell_detector import detect_shells, get_shell_accounts
from app.services.false_positive import filter_false_positives
from app.services.scorer import score_accounts
from app.services.ring_grouper import group_rings

class AnalysisState:
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AnalysisState, cls).__new__(cls)
            cls._instance.result = None
            cls._instance.df = None
        return cls._instance

    def update(self, result, df):
        self.result = result
        self.df = df
        gc.collect()

state = AnalysisState()

class UploadTransactionsView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload_start_time = time.time()
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"detail": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        if not file_obj.name.endswith('.csv'):
            return Response({"detail": "Only CSV files are allowed"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Memory optimization: Read directly from uploaded file
            df = pd.read_csv(file_obj)
        except Exception as e:
            return Response({"detail": f"Failed to parse CSV: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
            
        validation_result = validate_csv(df)
        if not validation_result["valid"]:
            return Response({
                "message": "CSV validation failed",
                "errors": validation_result["errors"],
            }, status=status.HTTP_400_BAD_REQUEST)

        # Ensure timestamp is datetime *after* validation to prevent string comparison bugs
        df["timestamp"] = pd.to_datetime(df["timestamp"])

        # 1. Build iGraph
        g = build_graph(df)
        
        # 2. Run detection algorithms
        # Parallel Execution of core detection algorithms
        start_time = time.time()
        with ThreadPoolExecutor() as executor:
            future_cycles = executor.submit(find_cycles, g)
            future_smurfing = executor.submit(detect_smurfing, g, df)
            future_shells = executor.submit(detect_shells, g, df)
            
            cycles = future_cycles.result()
            smurfing_results = future_smurfing.result()
            shell_results = future_shells.result()
        
        detection_time = time.time() - start_time
        
        # Filtering and Scoring
        fp_filter = filter_false_positives(
            {node for cycle in cycles for node in cycle} |
            {r["account_id"] for r in smurfing_results} |
            {node for chain in shell_results for node in chain},
            g, df
        )
        
        final_scores = score_accounts(
            g, df, cycles, smurfing_results, shell_results, fp_filter
        )
        
        # 4. Filter structures prior to grouping
        clean_cycles = []
        for c in cycles:
            fp_count = sum(1 for node in c if node in fp_filter)
            if fp_count <= len(c) / 2:
                clean_group = [n for n in c if n not in fp_filter]
                if len(clean_group) >= 2:
                    clean_cycles.append(clean_group)
                    
        clean_shells = []
        for s in shell_results:
            fp_count = sum(1 for node in s if node in fp_filter)
            if fp_count <= len(s) / 2:
                clean_group = [n for n in s if n not in fp_filter]
                if len(clean_group) >= 2:
                    clean_shells.append(clean_group)
                    
        clean_smurfing = [r for r in smurfing_results if r["account_id"] not in fp_filter]

        # 5. Build Fraud Rings and Inject IDs
        rings, final_scores = group_rings(
            clean_cycles, clean_smurfing, clean_shells, final_scores
        )

        # 5. Prepare Response Data Structures
        node_names = g.vs["name"]
        suspicious_map = {acc["account_id"]: acc for acc in final_scores}
        suspicious_ids = {acc["account_id"] for acc in final_scores if acc["suspicion_score"] > 30}
        
        all_accounts = {}
        for i, name in enumerate(node_names):
            if name in suspicious_map:
                acc = suspicious_map[name]
                all_accounts[name] = {
                    "account_id": name,
                    "suspicion_score": acc["suspicion_score"],
                    "detected_patterns": acc["detected_patterns"],
                    "ring_id": acc["ring_id"],
                    "total_transactions": g.degree(i)
                }
            else:
                all_accounts[name] = {
                    "account_id": name,
                    "suspicion_score": 0.0,
                    "detected_patterns": [],
                    "ring_id": None,
                    "total_transactions": g.degree(i)
                }

        edges_list = []
        for e in g.es:
            u_name = node_names[e.source]
            v_name = node_names[e.target]
            edges_list.append({
                "from_account": u_name,
                "to_account": v_name,
                "amount": float(e["amount"]),
                "suspicious": u_name in suspicious_ids or v_name in suspicious_ids
            })

        # Communities (using iGraph's fast community detection)
        try:
            # Louvain is much faster on iGraph
            clusters = g.community_multilevel()
            communities = {name: cluster_id for name, cluster_id in zip(node_names, clusters.membership)}
        except:
            communities = {name: 0 for name in node_names}

        # Optimized Adjacency
        adj = {name: [node_names[nbr] for nbr in g.successors(i)] for i, name in enumerate(node_names)}
        reverse_adj = {name: [node_names[nbr] for nbr in g.predecessors(i)] for i, name in enumerate(node_names)}
        node_degrees = {name: g.degree(i) for i, name in enumerate(node_names)}

        total_time = time.time() - upload_start_time
        response_data = {
            "suspicious_accounts": final_scores,
            "fraud_rings": rings,
            "summary": {
                "total_accounts_analyzed": len(all_accounts),
                "suspicious_accounts_flagged": len(final_scores),
                "fraud_rings_detected": len(rings),
                "detection_time_seconds": round(detection_time, 2),
                "total_processing_time_seconds": round(total_time, 2),
                "processing_time_seconds": round(total_time, 2), # Legacy support
            },
            "all_accounts": all_accounts,
            "edges": edges_list,
            "communities": communities,
            "node_degrees": node_degrees,
            "adj": adj,
            "reverse_adj": reverse_adj,
            "metadata": {
                "detection_time_ms": round(detection_time * 1000, 2),
                "total_processing_time_ms": round(total_time * 1000, 2),
                "account_count": len(all_accounts),
                "edge_count": len(edges_list)
            }
        }

        state.update(response_data, df)
        return Response(response_data)

class AllRingsView(APIView):
    def get(self, request):
        if state.result is None:
            return Response({"detail": "No analysis has been run yet"}, status=status.HTTP_404_NOT_FOUND)
        return Response(state.result.get("fraud_rings", []))

class RingDetailView(APIView):
    def get(self, request, ring_id):
        if state.result is None:
            return Response({"detail": "No analysis has been run yet"}, status=status.HTTP_404_NOT_FOUND)
        
        for ring in state.result.get("fraud_rings", []):
            if ring["ring_id"] == ring_id:
                return Response(ring)
        
        return Response({"detail": f"Ring '{ring_id}' not found"}, status=status.HTTP_404_NOT_FOUND)

class AccountDetailView(APIView):
    def get(self, request, account_id):
        if state.result is None:
            return Response({"detail": "No analysis has been run yet"}, status=status.HTTP_404_NOT_FOUND)
        
        for account in state.result.get("suspicious_accounts", []):
            if account["account_id"] == account_id:
                return Response(account)
        
        return Response({"detail": f"Account '{account_id}' not found"}, status=status.HTTP_404_NOT_FOUND)

class HashReportView(APIView):
    def post(self, request):
        report = request.data.get('report')
        if not report:
            return Response({"detail": "No report provided"}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            "sha256_hash": hash_report(report),
            "timestamp": get_timestamp()
        })
