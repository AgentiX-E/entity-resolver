import { readFileSync, writeFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const API_KEY = 'sk-c0b33fe973ac4f599b6e2e3a2125a5b0';
const base = '/workspace/entity-resolver/benchmarks/datasets';

function load(path: string): any[] {
  const pyFile = '/tmp/load_rec.py';
  writeFileSync(pyFile, 'import pandas as pd,json,sys\nd=pd.read_csv(sys.argv[1],encoding="latin1",dtype=str).fillna("")\nprint(json.dumps([{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]))\n');
  return JSON.parse(execSync('python3 ' + pyFile + ' ' + path, { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024 }).trim());
}

interface PairResult { leftId: number; rightId: number; score: number }

async function callLLM(prompt: string): Promise<string> {
  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0,
  });
  const result = spawnSync('curl', ['-s', '-m', '30',
    'https://api.deepseek.com/chat/completions',
    '-H', 'Content-Type: application/json',
    '-H', 'Authorization: Bearer ' + API_KEY,
    '-d', body,
  ], { encoding: 'utf-8', timeout: 30000 });
  try {
    const j = JSON.parse(result.stdout);
    return j.choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}

async function main() {
  console.log('=== LLM Enhanced Product Matching ===\n');

  // Load data
  const abt = load(base + '/Abt-Buy/Abt.csv');
  const buy = load(base + '/Abt-Buy/Buy.csv');
  const truth = new Set<string>();
  for (const line of readFileSync(base + '/Abt-Buy/abt_buy_perfectMapping.csv', 'utf-8').trim().split('\n').slice(1)) {
    const [l, r] = line.split(',').map((s: string) => s.trim().replace(/"/g, ''));
    if (l && r) truth.add(l + '|' + r);
  }

  // Score via jaro_winkler on small sample
  const core = await import('../packages/entity-resolver-core/dist/index.js');
  const { jaroWinklerScorer } = core as any;

  const sample = Math.min(200, abt.length, buy.length);
  const candidates: Array<{ lIdx: number; rIdx: number; score: number; lName: string; rName: string }> = [];
  for (let i = 0; i < sample; i++) {
    for (let j = 0; j < sample; j++) {
      const s = jaroWinklerScorer.score(abt[i]?.name ?? '', buy[j]?.name ?? '', {} as any);
      if (s > 0.5) candidates.push({ lIdx: i, rIdx: j, score: s, lName: String(abt[i]?.name ?? ''), rName: String(buy[j]?.name ?? '') });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // Baseline: top-10 by jw alone
  const baseline = candidates.slice(0, 10);
  let tpB = 0;
  const lIds = abt.map((r: any) => String(r.id ?? ''));
  const rIds = buy.map((r: any) => String(r.id ?? ''));
  for (const c of baseline) {
    if (truth.has(lIds[c.lIdx] + '|' + rIds[c.rIdx])) tpB++;
  }
  console.log('Abt-Buy baseline (top-10 by jw): tp=' + tpB + ' / 10');

  // LLM re-ranking: ask LLM to select matches from top-20
  const topForLLM = candidates.slice(0, 20);
  let prompt = 'Given these product pairs, output ONLY the numbers (comma-separated) of pairs that ARE the same product:\n\n';
  for (let i = 0; i < topForLLM.length; i++) {
    prompt += (i + 1) + '. ' + topForLLM[i]!.lName.slice(0, 60) + ' | ' + topForLLM[i]!.rName.slice(0, 60) + '\n';
  }
  prompt += '\nMatching pair numbers:';

  console.log('Querying DeepSeek...');
  const t0 = performance.now();
  const llmResp = await callLLM(prompt);
  const elapsed = performance.now() - t0;
  console.log('LLM response (' + (elapsed / 1000).toFixed(1) + 's): ' + llmResp.slice(0, 150));

  // Parse LLM selections
  const selected = (llmResp.match(/\d+/g) ?? []).map(Number).filter((n: number) => n >= 1 && n <= topForLLM.length);
  let tpLLM = 0;
  for (const n of selected) {
    const c = topForLLM[n - 1];
    if (c && truth.has(lIds[c.lIdx] + '|' + rIds[c.rIdx])) tpLLM++;
  }
  console.log('LLM selected: ' + selected.join(','));
  console.log('LLM tp=' + tpLLM + ' / ' + selected.length + ' (precision=' + (selected.length > 0 ? (tpLLM / selected.length).toFixed(2) : 'N/A') + ')');

  // Also check jw top-10 from the SAME 20
  const jwTop10 = topForLLM.slice(0, 10);
  let tpJW = 0;
  for (const c of jwTop10) {
    if (truth.has(lIds[c.lIdx] + '|' + rIds[c.rIdx])) tpJW++;
  }
  console.log('JW top-10 from top-20: tp=' + tpJW + ' / 10\n');

  console.log('Summary: Abt-Buy LLM-enhanced matching active.');
  console.log('LLM re-rank selects boundary pairs for human-like judgment.');
}
main();
