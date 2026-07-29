"""Splink benchmark — minimal, direct Linker API."""
import pandas as pd
import json, time, random, duckdb
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import splink.comparison_library as cl

OUT = "/workspace/entity-resolver/benchmark-results.json"

def gen(n, seed=42):
    random.seed(seed)
    first = ["john","jane","mike","lisa","tom","sue","bob","ann","jim","pam"]
    last  = ["smith","johnson","williams","brown","jones","garcia","miller","davis"]
    city  = ["new york","la","chicago","houston","phoenix","philly","austin"]
    recs = []
    for i in range(n):
        recs.append({"unique_id":i,"first":random.choice(first),"last":random.choice(last),"city":random.choice(city)})
    for i in range(int(n*0.3)):
        o = recs[i%len(recs)]
        c = dict(o)
        c["unique_id"] = n+i
        if random.random()<0.5: c["first"]=c["first"][:3]+"x"
        if random.random()<0.3: c["last"]+="s"
        recs.append(c)
    random.shuffle(recs)
    return recs

def run_splink(records):
    db = duckdb.connect()
    db.register("input_df", pd.DataFrame(records))
    db.execute("CREATE TABLE input AS SELECT * FROM input_df")

    settings = SettingsCreator(
        link_type="dedupe_only",
        comparisons=[cl.ExactMatch("first"), cl.JaroWinklerAtThresholds("last",0.9), cl.ExactMatch("city")],
        blocking_rules_to_generate_predictions=[block_on("first"), block_on("last")],
    )

    linker = Linker("input", settings, db_api=DuckDBAPI(connection=db))
    start = time.time()
    linker.training.estimate_parameters_using_expectation_maximisation("first")
    total_ms = round((time.time()-start)*1000)

    return {"records":len(records), "time_ms": total_ms}

if __name__=="__main__":
    all_results = []
    for n in [100,200,500]:
        print(f"Splink n={n}...",end=" ",flush=True)
        recs = gen(n,42)
        r = run_splink(recs)
        r["engine"]="splink"
        r["label"]=f"n{n}"
        all_results.append(r)
        print(f"{r['time_ms']}ms")

    with open(OUT,"w") as f: json.dump(all_results,f,indent=2)
    print(f"Saved {OUT}")
    for r in all_results: print(f"  {r['label']}: {r['time_ms']}ms, {r['records']} records")
