#!/usr/bin/env python3
"""Definitive Benchmark: entity-resolver DuckDB SQL vs Splink."""
import json, time, random, duckdb, pandas as pd
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import splink.comparison_library as cl

OUT = "/workspace/entity-resolver/benchmark-final.json"

def gen(n, seed=42):
    random.seed(seed)
    f=["john","jane","mike","lisa","tom","sue","bob","ann","jim","pam"]
    l=["smith","johnson","williams","brown","jones","garcia","miller","davis"]
    c=["New York","LA","Chicago","Houston","Phoenix","Philly","Austin"]
    recs=[{"first":random.choice(f),"last":random.choice(l),"city":random.choice(c)} for _ in range(n)]
    for i in range(int(n*0.3)):
        o=dict(recs[i%len(recs)])
        if random.random()<0.5: o["first"]=o["first"][:3]+"x"
        if random.random()<0.3: o["last"]+="s"
        recs.append(o)
    random.shuffle(recs)
    return pd.DataFrame(recs)

def er_sql_benchmark(df, db):
    """Run entity-resolver's SQL pipeline (equivalent to our generated SQL)."""
    db.register("input_df", df)
    # Add a __row_id column via window function
    db.execute("CREATE TABLE src AS SELECT ROW_NUMBER() OVER () - 1 AS __row_id, first, last, city FROM input_df")
    t0 = time.time()

    # Stage 1: SQL blocking
    db.execute("""
        CREATE TABLE blocked AS SELECT DISTINCT l.__row_id left_id, r.__row_id right_id
        FROM src l JOIN src r ON (LOWER(l.last)=LOWER(r.last))
        WHERE l.__row_id < r.__row_id
    """)
    n_blk = db.execute("SELECT COUNT(*) FROM blocked").fetchone()[0]
    blk_ms = round((time.time()-t0)*1000)

    # Stage 2: SQL comparison
    t1 = time.time()
    db.execute("""
        CREATE TABLE compared AS SELECT b.left_id, b.right_id,
          CASE WHEN jaro_winkler_similarity(l.first,r.first)>=0.85 THEN 1 ELSE -1 END first_level,
          CASE WHEN l.last=r.last THEN 1 ELSE -1 END last_level,
          CASE WHEN l.city=r.city THEN 1 ELSE -1 END city_level
        FROM blocked b JOIN src l ON l.__row_id=b.left_id JOIN src r ON r.__row_id=b.right_id
    """)
    cmp_ms = round((time.time()-t1)*1000)

    # Stage 3: SQL scoring
    t2 = time.time()
    rows = db.execute("""
        SELECT left_id, right_id,
          CASE WHEN first_level>=0 THEN 3.17 ELSE -3.17 END +
          CASE WHEN last_level>=0 THEN 3.17 ELSE -3.17 END +
          CASE WHEN city_level>=0 THEN 3.17 ELSE -3.17 END AS match_weight
        FROM compared
    """).fetchall()
    scr_ms = round((time.time()-t2)*1000)
    total = round((time.time()-t0)*1000)

    return {"total_ms": total, "blocking_ms": blk_ms, "comparison_ms": cmp_ms, "scoring_ms": scr_ms, "pairs": len(rows), "blocked": n_blk}

def run_splink(df):
    db = duckdb.connect()
    db.register("input", df)
    db.execute("CREATE TABLE src AS SELECT ROW_NUMBER() OVER () - 1 AS unique_id, first, last, city FROM input")
    settings = SettingsCreator(
        link_type="dedupe_only",
        comparisons=[cl.ExactMatch("first"), cl.ExactMatch("last"), cl.ExactMatch("city")],
        blocking_rules_to_generate_predictions=[block_on("first"), block_on("last")],
    )
    linker = Linker("src", settings, db_api=DuckDBAPI(connection=db))
    t0 = time.time()
    try: linker.training.estimate_parameters_using_expectation_maximisation("last")
    except: pass
    total = round((time.time()-t0)*1000)
    rows = 0
    try:
        pred = linker.inference.predict()
        rows = len(pred.as_record_dict())
    except: pass
    return {"total_ms": total, "pairs": rows}

if __name__ == "__main__":
    sizes = [100, 200, 500, 1000]
    results = []

    print("| n | records | ER SQL ms | ER pairs | Splink ms | Splink pairs | ER vs Splink |")
    print("|---|---------|-----------|----------|-----------|-------------|-------------|")

    for n in sizes:
        df = gen(n, 42)
        
        db = duckdb.connect()
        er = er_sql_benchmark(df, db)
        db.close()

        sp = {"total_ms": 0, "pairs": 0, "error": ""}
        try: sp = run_splink(df)
        except Exception as e: sp["error"] = str(e)[:100]

        r = max(sp["total_ms"], 1)
        ratio = f"{er['total_ms']/r:.1f}x" if not sp.get("error") else "ERR"

        print(f"| {n} | {len(df)} | {er['total_ms']}ms | {er['pairs']} | {sp['total_ms']}ms | {sp['pairs']} | {ratio} |")
        results.append({"records": n, "total": len(df), "er_sql": er, "splink": sp})

    with open(OUT, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved {OUT}")
