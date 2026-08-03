    },
    {
    },
  ];

  console.log('=== Entity Resolver Ensemble Benchmark ===\n');
  console.log('| Dataset          | F1        | vs Before | vs GoldenMatch | Pairs  | Time  |');
  console.log('|------------------|-----------|-----------|----------------|--------|-------|');

  for (const bm of benchmarks) {
    const left = load(base + '/' + bm.left);
    const right = load(base + '/' + bm.right);
    for (let i=0; i<left.length; i++) if (!(left[i] as any).id) (left[i] as any).id = String(i);
    for (let i=0; i<right.length; i++) if (!(right[i] as any).id) (right[i] as any).id = String(i+left.length);
    const lIds = left.map((r: any) => String(r.id ?? ''));
    const rIds = right.map((r: any) => String(r.id ?? ''));
    const truth = loadTruth(base + '/' + bm.truth);

    const metrics: any[] = [];
    for (let run=0; run<3; run++) {
      const db = new NodeDuckDBBackend('/tmp/er_' + bm.name.replace(/[^a-zA-Z0-9]/g,'_') + '_' + run + '.db');
      const t0 = performance.now();
      const result = await runSqlLinkage(left, right, bm.config, db);
      const elapsed = performance.now() - t0;
      const pairs = result.pairs ?? [];
      const pred = new Set<string>();
      for (const p of pairs) {
        if ((p.score ?? 0) >= (bm.config.matchThreshold ?? 0.3))
          pred.add(lIds[p.leftId] + '|' + rIds[p.rightId]);
      }
      let tp=0; for (const p of pred) if (truth.has(p)) tp++;
      const fp = pred.size - tp, fn = truth.size - tp;
      const f1 = tp>0 ? (2*tp)/(2*tp+fp+fn) : 0;
      metrics.push({f1, time: Math.round(elapsed), pairs: pairs.length});
      await db.close();
    }
    const avg = metrics.reduce((s,m)=>s+m.f1,0)/metrics.length;
    const avgT = Math.round(metrics.reduce((s,m)=>s+m.time,0)/metrics.length);
    const delta = avg - bm.before;
    const vsGM = bm.gm ? (avg - bm.gm).toFixed(4) : 'N/A';

    console.log('| ' + bm.name.padEnd(17) + '| ' + avg.toFixed(4).padStart(9) + ' | ' + ((delta>=0?'+':'')+delta.toFixed(4)).padStart(9) + ' | ' + vsGM.padStart(14) + ' | ' + String(metrics[0].pairs).padStart(6) + ' | ' + String(avgT+'ms').padStart(5) + ' |');
  }
  console.log('\nGoldenMatch: DBLP-ACM 0.9641 (zero-config)');
  console.log('Splink v4:   DBLP-ACM 0.577-0.728 (default SettingsCreator)');
}
main();
