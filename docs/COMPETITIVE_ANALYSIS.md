/**
 * Entity Resolver — Competitive Landscape & Optimization Plan
 *
 * Comprehensive analysis of competitors, datasets, and optimization paths.
 * All major open-source tools and academic benchmarks catalogued.
 *
 * Last updated: 2026-07-30
 */

// ═══════════════════════════════════════════════════════════════
// 1. COMPETITOR LANDSCAPE
// ═══════════════════════════════════════════════════════════════

export const COMPETITORS = {
  // ── Probabilistic (Fellegi-Sunter / EM-based) ──
  splink: {
    name: 'Splink',
    language: 'Python',
    engine: 'DuckDB / Spark / Athena / PostgreSQL',
    algorithm: 'Fellegi-Sunter EM + SQL pushdown',
    npm: null, // Python only
    strength: '1M records in ~60s, SQL-level parallelization',
    weakness: 'Python-only, no browser, no WASM, no PPRL',
    benchmark: 'DBLP-ACM, FEBRL, custom datasets',
  },
  recordlinkage: {
    name: 'Python Record Linkage Toolkit',
    language: 'Python',
    engine: 'Pandas/NumPy (in-memory)',
    algorithm: 'Fellegi-Sunter + rule-based',
    npm: null,
    strength: 'Academic standard, well-cited',
    weakness: 'No DB pushdown, OOM at 100K+',
    benchmark: 'FEBRL, custom',
  },
  fastLink: {
    name: 'fastLink',
    language: 'R',
    engine: 'C++ (Rcpp)',
    algorithm: 'Fellegi-Sunter EM (C++ accelerated)',
    npm: null,
    strength: 'Fast C++ EM, parallelized',
    weakness: 'R-only, no browser, limited scalability',
    benchmark: 'FEBRL, NCVR',
  },

  // ── Active Learning / ML-based ──
  dedupe: {
    name: 'dedupe',
    language: 'Python',
    engine: 'SQLite + NumPy',
    algorithm: 'Active learning + logistic regression + blocking',
    npm: 'dedupe (Python)',
    strength: 'No training data needed (active learning), clustering',
    weakness: 'Slow at scale, Python-only',
    benchmark: 'Custom',
  },
  zingg: {
    name: 'Zingg',
    language: 'Python / Java / Spark',
    engine: 'Spark (distributed)',
    algorithm: 'Active learning + ML models',
    npm: null,
    strength: 'Distributed (Spark), UI included',
    weakness: 'JVM overhead, complex setup',
    benchmark: 'Custom',
  },

  // ── Deep Learning / Embedding-based ──
  deepmatcher: {
    name: 'DeepMatcher',
    language: 'Python',
    engine: 'PyTorch',
    algorithm: 'RNN/Attention + cross-attention for pair matching',
    npm: null,
    strength: 'Deep learning SOTA on text-heavy datasets',
    weakness: 'Requires GPU, training data, slow inference',
    benchmark: 'Magellan, WDC products',
  },
  ditto: {
    name: 'Ditto',
    language: 'Python',
    engine: 'PyTorch / HuggingFace',
    algorithm: 'Pretrained LM (BERT/RoBERTa) fine-tuned for EM',
    npm: null,
    strength: 'Transformer SOTA accuracy on all benchmarks',
    weakness: 'GPU required, no blocking, slow per-pair',
    benchmark: 'Magellan, WDC products, Abt-Buy, DBLP-ACM',
  },
  deezymatch: {
    name: 'DeezyMatch',
    language: 'Python',
    engine: 'PyTorch',
    algorithm: 'Deep embeddings + ANN blocking',
    npm: null,
    strength: 'Efficient blocking via embeddings',
    weakness: 'Training data needed',
    benchmark: 'Historical map data',
  },

  // ── entity-resolver (our project) ──
  er: {
    name: 'entity-resolver',
    language: 'TypeScript',
    engine: 'DuckDB WASM / Node',
    algorithm: 'Fellegi-Sunter EM + SQL pushdown + WASM SIMD',
    npm: '@agentix-e/entity-resolver-* (10 packages)',
    strength: 'Browser/WASM, PPRL, MCP, 71 algorithms, Web Workers',
    weakness: 'Node↔DuckDB FFI latency at <500K',
    benchmark: 'DBLP-ACM, Amazon-Google, Abt-Buy, Synthetic 1M',
  },
};

// ═══════════════════════════════════════════════════════════════
// 2. BENCHMARK DATASETS
// ═══════════════════════════════════════════════════════════════

export const DATASETS = {
  // Leipzig Group (standard academic)
  'DBLP-ACM':     { source: 'Leipzig', records: '2,616 × 2,294', type: 'Clean-Clean', domain: 'Bibliographic' },
  'DBLP-Scholar':  { source: 'Leipzig', records: '2,616 × 64,263', type: 'Clean-Clean', domain: 'Bibliographic' },
  'Amazon-Google': { source: 'Leipzig', records: '1,363 × 3,226', type: 'Clean-Clean', domain: 'Product' },
  'Abt-Buy':      { source: 'Leipzig', records: '1,081 × 1,092', type: 'Clean-Clean', domain: 'Product' },

  // Magellan (UWM — used by DeepMatcher, Ditto)
  'Magellan-iTunes-Amazon': { source: 'UWM', records: 'various', type: 'Clean-Clean', domain: 'Product' },
  'Magellan-Beer':          { source: 'UWM', records: 'various', type: 'Clean-Clean', domain: 'Product' },
  'Magellan-Fodors-Zagats': { source: 'UWM', records: 'various', type: 'Clean-Clean', domain: 'Restaurant' },
  'Magellan-DBLP-ACM':      { source: 'UWM', records: 'various', type: 'Clean-Clean', domain: 'Bibliographic' },
  'Magellan-DBLP-Scholar':  { source: 'UWM', records: 'various', type: 'Clean-Clean', domain: 'Bibliographic' },
  'Magellan-Walmart-Amazon': { source: 'UWM', records: 'various', type: 'Clean-Clean', domain: 'Product' },

  // WDC Products (Web Data Commons — massive)
  'WDC-cameras':    { source: 'WDC', records: '~2M', type: 'Clean-Clean', domain: 'Product' },
  'WDC-computers':  { source: 'WDC', records: '~2M', type: 'Clean-Clean', domain: 'Product' },
  'WDC-shoes':      { source: 'WDC', records: '~2M', type: 'Clean-Clean', domain: 'Product' },
  'WDC-watches':    { source: 'WDC', records: '~2M', type: 'Clean-Clean', domain: 'Product' },

  // FEBRL (ANU — census data with controlled errors)
  'FEBRL-1000':  { source: 'ANU', records: '1,000', type: 'Dedupe', domain: 'Census' },
  'FEBRL-5000':  { source: 'ANU', records: '5,000', type: 'Dedupe', domain: 'Census' },
  'FEBRL-10000': { source: 'ANU', records: '10,000', type: 'Dedupe', domain: 'Census' },

  // Cora (citation matching)
  'Cora': { source: 'UMass', records: '1,879', type: 'Dedupe', domain: 'Citation' },

  // NCVR (voter registration)
  'NCVR': { source: 'NIST', records: '~6M', type: 'Dedupe', domain: 'Census' },

  // We already have
  'Synthetic-1M': { source: 'entity-resolver', records: '1,200,000', type: 'Dedupe', domain: 'Synthetic' },
};

// ═══════════════════════════════════════════════════════════════
// 3. npm PACKAGES FOR STRING SIMILARITY (ALTERNATIVES TO OUR WASM)
// ═══════════════════════════════════════════════════════════════

export const NPM_STRING_ALTERNATIVES = {
  'fastest-levenshtein': {
    desc: 'Fastest JS Levenshtein implementation (single-row array, bit-masking)',
    speed: '~10M ops/s (JS)',
    advantage: 'Zero WASM dependency, works in all Node versions',
  },
  'talisman': {
    desc: 'Comprehensive NLP/similarity library with Jaro, Jaro-Winkler, Dice, etc.',
    speed: '~2M ops/s (JS)',
    advantage: 'Battle-tested, 30+ algorithms',
  },
  'string-similarity': {
    desc: 'Dice, Levenshtein, Jaro-Winkler, overlap — simple API',
    speed: '~1M ops/s (JS)',
    advantage: 'Lightweight, zero config',
  },
  'natural': {
    desc: 'NLP toolkit with Jaro-Winkler, Dice, Levenshtein',
    speed: '~1M ops/s (JS)',
    advantage: 'Full NLP pipeline (tokenizer, stemmer, etc.)',
  },
  'strsimkit': {
    desc: 'Our existing WASM scorer (Rust compiled to WASM)',
    speed: '~50M ops/s (WASM)',
    advantage: 'Blazing fast, but WASM weight + async init',
  },
  'fuzzball': {
    desc: 'Fuzzy string matching library inspired by TheFuzz (Python)',
    speed: '~5M ops/s (JS)',
    advantage: 'Rich API with ratio, partial_ratio, token_sort_ratio',
  },
};

// ═══════════════════════════════════════════════════════════════
// 4. OPTIMIZATION PLAN
// ═══════════════════════════════════════════════════════════════

export const OPTIMIZATION_PLAN = {
  // ── Immediate (P11) ──
  P11_add_wdc_magellan: {
    desc: 'Download WDC Products and Magellan datasets',
    impact: 'Adds 8+ academic benchmarks, matches Ditto/DeepMatcher scope',
    effort: '1 day',
  },
  P11_staged_benchmark: {
    desc: 'Run benchmark at 1K→10K→100K→1M with all metrics (F1, precision, recall, time)',
    impact: 'Provides scientific-grade comparison at every scale',
    effort: '1 day',
  },
  P11_add_recordlinkage_competitor: {
    desc: 'Add Python Record Linkage Toolkit as competitor in benchmark',
    impact: '3-way comparison: ER vs Splink vs recordlinkage',
    effort: '2 hours',
  },

  // ── Short-term (P12) ──
  P12_wasm_warm_start: {
    desc: 'Pre-initialize WASM module at package import (not first use)',
    impact: 'Eliminates 100ms+ first-call latency on all WASM scorers',
    effort: '1 day',
  },
  P12_native_js_scorer: {
    desc: 'Add fastest-levenshtein as JS fallback for environments without WASM',
    impact: 'Maintains speed without WASM dependency',
    effort: '2 hours',
  },
  P12_em_sql_inline: {
    desc: 'Move EM training into SQL as aggregate computation (not JS loop)',
    impact: 'Eliminates vector materialization overhead in SQL pipeline',
    effort: '2 days',
  },
  P12_trigger_inference: {
    desc: 'Add trigram-based similarity + Soundex pre-filter to SQL pipeline',
    impact: 'Additional 30-50% pair reduction before expensive UDF calls',
    effort: '1 day',
  },

  // ── Medium-term (P13) ──
  P13_ditto_style_llm: {
    desc: 'Integrate DeepSeek LLM API for ambiguous pair classification',
    impact: 'Transformer accuracy on edge cases, matches Ditto approach',
    effort: '1 week',
    requires: 'LLM API key (available)',
  },
  P13_deezymatch_blocking: {
    desc: 'Add embedding-based blocking (sentence-transformers → ONNX)',
    impact: 'State-of-the-art blocking for text-heavy datasets',
    effort: '1 week',
  },
  P13_transfer_learning_em: {
    desc: 'Pre-train m/u parameters on DBLP-ACM and transfer to similar datasets',
    impact: 'Eliminates EM training cost on new datasets',
    effort: '1 week',
  },

  // ── Full Comparison Target ──
  target: {
    datasets: '10+ academic datasets (all Leipzig + all Magellan + WDC mini)',
    competitors: 'Splink, recordlinkage, dedupe (all Python)',
    metrics: 'F1, precision, recall, time, throughput',
    scales: '1K → 10K → 50K → 100K → 1M',
    goal: 'entity-resolver #1 on ALL metrics at EVERY scale',
  },
};
