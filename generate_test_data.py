import pandas as pd
from datetime import datetime, timedelta
import random

# Start time
base_time = datetime(2026, 1, 1, 12, 0, 0)
transactions = []
tx_id = 1

def add_tx(sender, receiver, amount, time_offset_hours):
    global tx_id
    transactions.append({
        "transaction_id": f"TX_{tx_id:05d}",
        "sender_id": sender,
        "receiver_id": receiver,
        "amount": amount,
        "timestamp": (base_time + timedelta(hours=time_offset_hours)).strftime("%Y-%m-%d %H:%M:%S")
    })
    tx_id += 1

# 1. Clear Fraud Ring (Cycle)
# A -> B -> C -> D -> A
add_tx("FRAUD_A", "FRAUD_B", 5000, 1)
add_tx("FRAUD_B", "FRAUD_C", 4900, 2)
add_tx("FRAUD_C", "FRAUD_D", 4800, 3)
add_tx("FRAUD_D", "FRAUD_A", 4700, 4)

# 2. Smurfing Pattern 
# Many small deposits to one account, which then sends a large amount out
for i in range(1, 15):
    add_tx(f"SMURF_SRC_{i}", "SMURF_TARGET", 9000, 5 + (i*0.1)) # Just under 10k reporting limit
add_tx("SMURF_TARGET", "SMURF_DESTINATION", 125000, 10)

# 3. Shell Company Chain
# Straight line of transfers to hide money origin
add_tx("SHELL_START", "SHELL_NODE_1", 20000, 11)
add_tx("SHELL_NODE_1", "SHELL_NODE_2", 19500, 12)
add_tx("SHELL_NODE_2", "SHELL_NODE_3", 19000, 13)
add_tx("SHELL_NODE_3", "SHELL_CAYMAN", 18500, 14)

# 4. Safe Institutional Merchant (High in-volume, low out-volume)
for i in range(1, 30):
    add_tx(f"CUSTOMER_{i}", "SAFE_MERCHANT", random.uniform(50, 500), 15 + i)
add_tx("SAFE_MERCHANT", "MERCHANT_SUPPLIER", 4000, 50)

# 5. Safe Payroll (High out-volume, consistent amounts)
for i in range(1, 25):
    add_tx("SAFE_PAYROLL_CORP", f"EMPLOYEE_{i}", 3500, 60) # Everyone gets paid 3500

# 6. Random Safe Noise
for i in range(100):
    add_tx(f"RANDOM_{random.randint(1, 50)}", f"RANDOM_{random.randint(51, 100)}", random.uniform(10, 2000), random.uniform(0, 100))

df = pd.DataFrame(transactions)
df.to_csv("c:/Users/Piyush/Downloads/test_confirmed_rings.csv", index=False)
print("Created c:/Users/Piyush/Downloads/test_confirmed_rings.csv with", len(df), "transactions.")
