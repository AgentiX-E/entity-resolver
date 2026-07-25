# @agentix-e/entity-resolver-browser

**Browser adapters** for entity-resolver-core. Entity resolution in the browser with DuckDB WASM.

## Backends

| Backend | Purpose |
|---------|---------|
| `FetchDataSource` | Load records from HTTP endpoints |
| `FileReaderDataSource` | Load records from user-uploaded files |
| `IndexedDBEntityStore` | Persistent entity storage |
| `LocalStorageConfigStore` | Pipeline config persistence |
| `DuckDBWasmStore` | DuckDB WASM in-browser SQL |

## Quick Start

```html
<script type="module">
  import { dedupe } from '@agentix-e/entity-resolver-core';
  // Full ER pipeline runs in browser via WASM
</script>
```

## License

MIT © Lambertyan
