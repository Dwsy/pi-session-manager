# Embedding Service Integration Design

## Goal

Extend pi-session-manager as a centralized embedding service for multiple pi processes to share, avoiding each process loading 400MB+ models independently.

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌─────────────────┐
│   pi process 1  │     │   pi-session-manager        │     │  GGUF Model     │
│  (role-persona) │────▶│   :11434 (HTTP API)         │────▶│  (313MB Q8_0)   │
└─────────────────┘     │                             │     └─────────────────┘
┌─────────────────┐     │  ┌─────────────────────┐    │              │
│   pi process 2  │────▶│  │ node-llama-cpp      │◀───┘              │
│  (role-persona) │     │  │ embedding service   │                     │
└─────────────────┘     │  │ (child process)     │─────────────────────┘
┌─────────────────┐     │  └─────────────────────┘
│   pi process N  │────▶│        ↑
│  (role-persona) │     │   lazy load / auto-release
└─────────────────┘     └─────────────────────────────┘
```

## API Design

### POST /v1/embedding

Generate vector embeddings for text.

**Request:**

```json
{
  "text": "I prefer TypeScript over JavaScript",
  "model": "embeddinggemma-300m-qat-q8_0"  // optional, default
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "embedding": [0.023, -0.015, ...],  // 768 dimensions
    "dimensions": 768,
    "model": "embeddinggemma-300m-qat-q8_0",
    "normalized": true
  }
}
```

### POST /v1/embedding/batch

Generate embeddings in batch (more efficient).

**Request:**

```json
{
  "texts": ["text1", "text2", "text3"]
}
```

### GET /v1/embedding/status

Get service status.

**Response:**

```json
{
  "ready": true,
  "model_loaded": true,
  "model": "embeddinggemma-300m-qat-q8_0",
  "dimensions": 768,
  "memory_mb": 435
}
```

## Implementation Options

### Option A: Pure Rust (candle/llm.rs)

**Pros:** Single process, no external dependencies
**Cons:** Incomplete GGUF support, complex implementation

### Option B: Node.js Child Process (Recommended)

**Pros:** Reuse mature node-llama-cpp, rapid implementation
**Cons:** One additional process

### Option C: Call External llama-server

**Pros:** Most flexible, can be upgraded independently
**Cons:** Requires users to manually manage

## Recommended Implementation (Option B)

### pi-session-manager Changes

1. Add `embedding_service.rs` module
2. Add `/v1/embedding` route in `http_adapter.rs`
3. Check model file at startup, start node-llama-cpp service on demand

### Child Process Management

```rust
struct EmbeddingService {
    process: Option<Child>,
    port: u16,
    model_path: PathBuf,
}

impl EmbeddingService {
    async fn ensure_running(&mut self) -> Result<u16, Error> {
        if self.process.is_none() {
            self.start().await?;
        }
        Ok(self.port)
    }

    async fn start(&mut self) -> Result<(), Error> {
        // Start node-llama-cpp embedding service
        let child = Command::new("node")
            .arg("embedding-server.js")
            .arg("--model").arg(&self.model_path)
            .arg("--port").arg(self.port.to_string())
            .spawn()?;

        self.process = Some(child);

        // Wait for ready probe
        self.wait_for_ready().await
    }
}
```

### pi-gateway (role-persona) Changes

Modify `memory-vector.ts`, add HTTP embedding provider:

```typescript
class HttpEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/v1/embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    return data.data.embedding;
  }
}
```

## Configuration

### pi-session-manager

```json
{
  "embedding": {
    "enabled": true,
    "model_path": "~/.pi/models/embedding-models/embeddinggemma-300M-Q8_0.gguf",
    "port": 11435,  // internal port for node service
    "auto_release_minutes": 5
  }
}
```

### pi-gateway

```json
{
  "vectorMemory": {
    "provider": "http",  // "openai" | "local" | "http"
    "http_endpoint": "http://127.0.0.1:11434/v1/embedding"
  }
}
```

## Memory Optimization

| Scenario | Current (per process) | New Solution |
|----------|----------------------|--------------|
| 1 pi process | 435 MB | 435 MB |
| 3 pi processes | 1.3 GB | 435 MB (shared) |
| 5 pi processes | 2.1 GB | 435 MB (shared) |

## Implementation Steps

1. **Phase 1**: Create standalone embedding-server.js (Node.js)
2. **Phase 2**: pi-session-manager integrates child process management
3. **Phase 3**: pi-gateway adds HTTP provider support
4. **Phase 4**: Test multi-process sharing scenario

## Alternative: Directly Use llama.cpp Server

If you prefer simplicity, you can directly use llama.cpp's server mode:

```bash
./llama-server -m embeddinggemma-300M-Q8_0.gguf --embedding --port 8080
```

Then pi-session-manager only acts as a proxy, and pi-gateway directly calls llama-server.
