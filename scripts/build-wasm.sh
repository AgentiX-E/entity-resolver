#!/bin/bash
# entity-resolver WASM ensemble scorer build script
# Run on local machine (requires: rustup, wasm-pack, Node.js)
set -euo pipefail

echo "=== entity-resolver WASM Ensemble Scorer Build ==="

# Step 1: Install wasm32 target if needed
rustup target add wasm32-unknown-unknown 2>/dev/null || true

# Step 2: Build WASM from existing rust-scorer
cd packages/entity-resolver-core/src/matching/scorers/wasm/rust-scorer

echo "Building WASM ensemble scorer..."
wasm-pack build --target bundler --out-dir ../scorers --release

echo "Generated files:"
ls -la ../scorers/

echo ""
echo "=== WASM build complete ==="
echo "Run benchmark:"
echo "  cd /workspace/entity-resolver"
echo "  node --import tsx benchmarks/p0.ts"
echo ""
echo "Expected: DBLP-ACM F1 0.88 -> 0.92 via native ensemble"
