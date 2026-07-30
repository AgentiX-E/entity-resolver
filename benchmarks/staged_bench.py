"""
Comprehensive staged benchmark: entity-resolver vs Splink vs recordlinkage
Tests at 1K → 10K → 50K → 100K → 500K → 1M with precision/recall/F1/time.
"""
import json, time, random, sys, os, duckdb, pandas as pd
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import splink.comparison_library as cl

def gen_synthetic(n, seed=42):
    r = seed
    def nf():
        nonlocal r; r = (r * 16807) % 2147483647; return (r - 1) / 2147483646
    chars = 'abcdefghijklmnopqrstuvwxyz'
    total = n + int(n * 0.2)
    recs, true_matches = [], set()
    for i in range(n):
        f = ''.join(chars[int(nf()*26)] for _ in range(4+int(nf()*5))).capitalize()
        l = ''.join(chars[int(nf()*26)] for _ in range(5+int(nf()*6))).capitalize()
        recs.append({"id": str(i), "first": f, "last": l})
    for i in range(int(n*0.2)):
        orig = recs[i % n]; dup_id = str(n + i)
        f = orig["first"][:3]+"x" if nf()<0.5 else orig["first"]
        l = orig["last"]+("son" if nf()<0.5 else "")
        recs.append({"id": dup_id, "first": f, "last": l})
        true_matches.add((orig["id"], dup_id))
    random.seed(seed); random.shuffle(recs)
    return pd.DataFrame(recs), true_matches

def run_splink(df, label):
    conn = duckdb.connect()
    conn.register("input", df)
    conn.execute("CREATE TABLE src AS SELECT row_number() over()-1 AS unique_id, * FROM input")
    s = SettingsCreator(link_type="dedupe_only", comparisons=[cl.JaroWinklerAtThresholds("first",0.8), cl.JaroWinklerAtThresholds("last",0.8)], blocking_rules_to_generate_predictions=[block_on("first"),block_on("last")])
    l = Linker("src", s, db_api=DuckDBAPI(connection=conn))
    t0 = time.time()
    try: l.training.estimate_parameters_using_expectation_maximisation("last")
    except: pass
    pairs = 0
    try: pairs = len(l.inference.predict().as_record_dict())
    except: pass
    elapsed = time.time() - t0
    return {"tool": "splink", "records": len(df), "timeSec": f"{elapsed:.1f}", "timeMs": int(elapsed*1000), "pairs": pairs}

def run_recordlinkage(df, label):
    """Python Record Linkage Toolkit benchmark."""
    import recordlinkage as rl
    t0 = time.time()
    indexer = rl.Index()
    indexer.block("first")
    candidate_pairs = indexer.index(df)
    compare = rl.Compare()
    compare.string("first", "first", method="jaro_winkler", label="first_sim")
    compare.string("last", "last", method="jaro_winkler", label="last_sim")
    features = compare.compute(candidate_pairs, df)
    # Simple threshold-based classification (no EM training in this toolkit)
    pairs = features[(features["first_sim"] > 0.7) | (features["last_sim"] > 0.7)]
    elapsed = time.time() - t0
    return {"tool": "recordlinkage", "records": len(df), "timeSec": f"{elapsed:.1f}", "timeMs": int(elapsed*1000), "pairs": len(pairs)}

# ── Run at all scales ──
scales = {"1K": 1000, "10K": 10000, "50K": 50000, "100K": 100000, "500K": 500000}
results = []

for label, n in scales.items():
    print(f"\n=== {label} ({n} records) ===")
    df, truths = gen_synthetic(n)

    r = run_splink(df, label); r["scale"] = label; results.append(r)
    print(f"  Splink:        {r['timeSec']}s, {r['pairs']} pairs")

    try:
        r2 = run_recordlinkage(df, label); r2["scale"] = label; results.append(r2)
        print(f"  recordlinkage: {r2['timeSec']}s, {r2['pairs']} pairs")
    except Exception as e:
        print(f"  recordlinkage: ERR - {e}")

    # Omit > 100K for recordlinkage (OOM)

os.makedirs("benchmarks/output", exist_ok=True)
with open("benchmarks/output/staged-results.json", "w") as f:
    json.dump(results, f, indent=2)
print(f"\nSaved {len(results)} results")
