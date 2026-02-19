import pandas as pd
from datetime import datetime, timedelta, timezone

def fix_csv(path):
    df = pd.read_csv(path)
    
    new_timestamps = []
    for ts in df['timestamp']:
        try:
            # Try to parse with pandas first
            val = pd.to_datetime(ts, utc=True)
            new_timestamps.append(val)
        except:
            if 'T' in ts:
                base_date_str, time_part = ts.split('T')
                if time_part.endswith('Z'): time_part = time_part[:-1]
                h, m, s = map(int, time_part.split(':'))
                base = datetime.strptime(base_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                new_timestamps.append(base + timedelta(hours=h, minutes=m, seconds=s))
            else:
                new_timestamps.append(pd.NaT)

    df['timestamp'] = new_timestamps
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    df.to_csv(path, index=False)
    print(f"Fixed {path}")

fix_csv('frontend/public/data/sample_transactions.csv')
fix_csv('frontend/data/sample_transactions.csv')
