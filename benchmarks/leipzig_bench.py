"""Leipzig & synthetic benchmark — Splink vs entity-resolver."""
import json, time, os, duckdb, pandas as pd
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import splink.comparison_library as cl

def run_splink(name, df, comparisons, blocks):
    conn = duckdb.connect()
    conn.register("input", df)
    conn.execute("CREATE TABLE src AS SELECT row_number() over () - 1 AS unique_id, * FROM input")
    settings = SettingsCreator(link_type="dedupe_only", comparisons=comparisons, blocking_rules_to_generate_predictions=blocks)
    linker = Linker("src", settings, db_api=DuckDBAPI(connection=conn))
    t0 = time.time()
    try: linker.training.estimate_parameters_using_expectation_maximisation([b.blocking_column for b in blocks][-1])
    except: pass
    pairs = 0
    try: pairs = len(linker.inference.predict().as_record_dict())
    except: pass
    return {"dataset": name, "engine": "splink", "records": len(df), "timeMs": int((time.time()-t0)*1000), "timeSec": f"{time.time()-t0:.1f}", "pairs": pairs}

os.makedirs("benchmarks/output", exist_ok=True)
results = []

# 1. Synthetic (100K, random names)
print("=== Synthetic 100K ===")
import random; random.seed(42)
N, chars = 100000, 'abcdefghijklmnopqrstuvwxyz'
def gname(l): return ''.join(random.choice(chars) for _ in range(l)).capitalize()
recs = [{"first":gname(random.randint(4,8)), "last":gname(random.randint(5,10))} for _ in range(N)]
for i in range(int(N*.2)): recs.append({"first":recs[i]["first"], "last":recs[i]["last"]+"son"})
random.shuffle(recs)
r = run_splink("Synthetic-100K", pd.DataFrame(recs), [cl.JaroWinklerAtThresholds("first",0.8), cl.JaroWinklerAtThresholds("last",0.8)], [block_on("first"), block_on("last")])
results.append(r); print(f"  {r['engine']}: {r['timeSec']}s, {r['pairs']} pairs")

# 2. DBLP-ACM
print("\n=== DBLP-ACM ===")
dblp = pd.read_csv("benchmarks/datasets/DBLP-ACM/DBLP2.csv", encoding="latin1").fillna("")
acm = pd.read_csv("benchmarks/datasets/DBLP-ACM/ACM.csv", encoding="latin1").fillna("")
dblp["id"] = "d_"+dblp["id"].astype(str); acm["id"] = "a_"+acm["id"].astype(str)
all_records = pd.concat([dblp, acm], ignore_index=True)
r = run_splink("DBLP-ACM", all_records, [cl.JaroWinklerAtThresholds("title",0.8), cl.ExactMatch("year")], [block_on("title"), block_on("year")])
results.append(r); print(f"  {r['engine']}: {r['timeSec']}s, {r['pairs']} pairs")

# 3. Amazon-Google
print("\n=== Amazon-Google ===")
ag_amz = pd.read_csv("benchmarks/datasets/Amazon-Google/Amazon.csv", encoding="latin1").fillna("")
ag_goog = pd.read_csv("benchmarks/datasets/Amazon-Google/GoogleProducts.csv", encoding="latin1").fillna("")
ag_amz["id"] = "amz_"+ag_amz["id"].astype(str); ag_goog["id"] = "goog_"+ag_goog["id"].astype(str)
all_ag = pd.concat([ag_amz, ag_goog], ignore_index=True)
r = run_splink("Amazon-Google", all_ag, [cl.JaroWinklerAtThresholds("title",0.8), cl.ExactMatch("manufacturer")], [block_on("title"), block_on("manufacturer")])
results.append(r); print(f"  {r['engine']}: {r['timeSec']}s, {r['pairs']} pairs")

with open("benchmarks/output/leipzig-results.json","w") as f: json.dump(results, f, indent=2)
print(f"\nSaved {len(results)} results")
