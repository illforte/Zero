/**
 * Phase 3: LiteLLM Routing Tests
 *
 * Tests chat completions, model listing, streaming, and auth.
 * Produces traces that Phase 4 will verify in Langfuse.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const LITELLM_URL = process.env.LITELLM_URL || 'http://127.0.0.1:4000';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY;

if (!LITELLM_API_KEY) {
  console.error('LITELLM_API_KEY not set — skipping LiteLLM tests');
  process.exit(0);
}

async function fetchLiteLLM(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${LITELLM_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_API_KEY}`,
        ...options.headers,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

describe('Phase 3: LiteLLM Routing', () => {
  it('1. List models — mail-zero-chat exists', async () => {
    const res = await fetchLiteLLM('/v1/models');
    assert.equal(res.status, 200, `Models endpoint returned ${res.status}`);
    const body = await res.json();
    assert.ok(body.data, 'Should have data array');
    const modelIds = body.data.map((m) => m.id);
    console.log(`  Found ${modelIds.length} models`);
    assert.ok(
      modelIds.includes('mail-zero-chat'),
      `mail-zero-chat not found. Available: ${modelIds.join(', ')}`,
    );
  });

  it('2. Chat completion — returns message content', async () => {
    const res = await fetchLiteLLM('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'mail-zero-chat',
        messages: [
          { role: 'user', content: 'Say "E2E test OK" and nothing else.' },
        ],
        max_tokens: 50,
        metadata: { test: 'e2e-lair404', phase: '3' },
      }),
    });
    assert.equal(res.status, 200, `Chat completion returned ${res.status}`);
    const body = await res.json();
    assert.ok(body.choices, 'Should have choices');
    assert.ok(body.choices.length > 0, 'Should have at least one choice');
    const content = body.choices[0].message?.content;
    assert.ok(content, 'Choice should have message content');
    assert.ok(content.length > 0, 'Message content should not be empty');
    console.log(`  Response: ${content.substring(0, 100)}`);
  });

  it('3. Streaming — receives SSE with [DONE]', async () => {
    const res = await fetchLiteLLM('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'mail-zero-chat',
        messages: [{ role: 'user', content: 'Count from 1 to 3.' }],
        max_tokens: 50,
        stream: true,
        metadata: { test: 'e2e-lair404-stream', phase: '3' },
      }),
    });
    assert.equal(res.status, 200, `Streaming returned ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    assert.ok(
      contentType.includes('text/event-stream'),
      `Expected SSE content type, got: ${contentType}`,
    );

    const text = await res.text();
    assert.ok(text.includes('[DONE]'), 'Stream should end with [DONE]');

    // Count chunks
    const dataLines = text.split('\n').filter((l) => l.startsWith('data: '));
    console.log(`  Received ${dataLines.length} SSE chunks`);
    assert.ok(dataLines.length >= 2, 'Should have multiple chunks');
  });

  it('4. Invalid key — HTTP 401/403', async () => {
    const res = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-invalid-key-12345',
      },
      body: JSON.stringify({
        model: 'mail-zero-chat',
        messages: [{ role: 'user', content: 'test' }],
      }),
    });
    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`,
    );
    console.log(`  Invalid key rejected with HTTP ${res.status}`);
  });

  it('5. Key info — returns metadata', async () => {
    const res = await fetchLiteLLM('/key/info');
    assert.equal(res.status, 200, `Key info returned ${res.status}`);
    const body = await res.json();
    assert.ok(body.key || body.info, 'Should return key info');
    console.log(`  Key alias: ${body.info?.key_alias || body.key || 'unknown'}`);
  });
});
