#!/usr/bin/env node
/**
 * Embedding Server - Local GGUF model inference service (ES Module)
 * 
 * Usage: node embedding-server.mjs --model <path> --port <port>
 * 
 * Provides HTTP endpoints for text embedding using node-llama-cpp
 */

import http from 'http';
import { URL } from 'url';
import { getLlama, LlamaLogLevel } from 'node-llama-cpp';
import path from 'path';
import os from 'os';

// Parse arguments
const args = process.argv.slice(2);
let MODEL_PATH = '';
let PORT = 11435;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--model' && args[i + 1]) {
    MODEL_PATH = args[i + 1];
    i++;
  } else if (args[i] === '--port' && args[i + 1]) {
    PORT = parseInt(args[i + 1], 10);
    i++;
  }
}

if (!MODEL_PATH) {
  console.error('Error: --model argument required');
  process.exit(1);
}

// Global state
let llama = null;
let embeddingModel = null;
let embeddingContext = null;
let isReady = false;

const DIMENSIONS = 768;
const MAX_CONTEXT_LENGTH = 2048;

/**
 * Initialize the embedding model
 */
async function initModel() {
  console.log(`[Embedding] Loading model: ${MODEL_PATH}`);
  const startTime = Date.now();
  
  try {
    llama = await getLlama({ 
      logLevel: LlamaLogLevel.error,
      maxThreads: Math.min(4, os.cpus().length),
    });
    
    embeddingModel = await llama.loadModel({
      modelPath: MODEL_PATH,
      embedding: true,
    });
    
    embeddingContext = await embeddingModel.createEmbeddingContext();
    
    isReady = true;
    const loadTime = Date.now() - startTime;
    console.log(`[Embedding] Model loaded in ${loadTime}ms`);
    console.log(`[Embedding] Dimensions: ${DIMENSIONS}`);
    console.log(`[Embedding] Max context: ${MAX_CONTEXT_LENGTH}`);
    
  } catch (err) {
    console.error('[Embedding] Failed to load model:', err.message);
    process.exit(1);
  }
}

/**
 * Generate embedding for text
 */
async function embedText(text, normalize = true) {
  if (!isReady || !embeddingContext) {
    throw new Error('Model not ready');
  }

  const maxChars = MAX_CONTEXT_LENGTH * 4;
  const truncated = text.length > maxChars ? text.slice(0, maxChars) : text;
  
  const embedding = await embeddingContext.getEmbeddingFor(truncated);
  let vector = embedding.vector;
  
  if (normalize) {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      vector = vector.map(v => v / magnitude);
    }
  }
  
  return vector;
}

/**
 * Parse HTTP request body
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * HTTP Request handler
 */
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  
  // Health check endpoint
  if (parsedUrl.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      ready: isReady,
      model: path.basename(MODEL_PATH),
      dimensions: DIMENSIONS,
    }));
    return;
  }

  // Single embedding endpoint
  if (parsedUrl.pathname === '/embed' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { text, normalize = true } = JSON.parse(body);
      
      if (!text || typeof text !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid text field' }));
        return;
      }

      const startTime = Date.now();
      const embedding = await embedText(text, normalize);
      const elapsed = Date.now() - startTime;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        embedding,
        dimensions: embedding.length,
        normalized: normalize,
        time_ms: elapsed,
      }));
      
    } catch (err) {
      console.error('[Embedding] Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Batch embedding endpoint
  if (parsedUrl.pathname === '/embed/batch' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { texts, normalize = true } = JSON.parse(body);
      
      if (!Array.isArray(texts)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid texts field' }));
        return;
      }

      const startTime = Date.now();
      const embeddings = [];
      
      for (const text of texts) {
        if (typeof text !== 'string') {
          embeddings.push(null);
          continue;
        }
        try {
          const embedding = await embedText(text, normalize);
          embeddings.push({
            embedding,
            dimensions: embedding.length,
            normalized: normalize,
          });
        } catch (e) {
          console.error('[Embedding] Batch item error:', e.message);
          embeddings.push({ error: e.message });
        }
      }
      
      const elapsed = Date.now() - startTime;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        embeddings,
        count: embeddings.length,
        time_ms: elapsed,
      }));
      
    } catch (err) {
      console.error('[Embedding] Batch error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
async function main() {
  await initModel();
  
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Embedding] Server listening on http://127.0.0.1:${PORT}`);
  });
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function shutdown() {
  console.log('\n[Embedding] Shutting down...');
  server.close(() => {
    console.log('[Embedding] Server closed');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Embedding] Fatal error:', err);
  process.exit(1);
});
