/**
 * Phase 4: Langfuse Trace Verification
 *
 * Verifies that LiteLLM calls from Phase 3 produced traces in Langfuse.
 * Runs with a 5s delay to allow async trace ingestion.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

const LANGFUSE_URL = process.env.LANGFUSE_URL || 'http://127.0.0.1:3032';
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;

if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
  console.error('LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set — skipping Langfuse tests');
  process.exit(0);
}

const authHeader =
  'Basic ' + Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64');

async function fetchLangfuse(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${LANGFUSE_URL}${path}`, {
      headers: { Authorization: authHeader },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

describe('Phase 4: Langfuse Trace Verification', () => {
  let recentTraces = [];

  before(async () => {
    // Wait for async trace ingestion
    console.log('  Waiting 5s for trace ingestion...');
    await new Promise((r) => setTimeout(r, 5_000));
  });

  it('1. Query recent traces — data returned', async () => {
    const res = await fetchLangfuse('/api/public/traces?limit=10&orderBy=timestamp&order=DESC');
    assert.equal(res.status, 200, `Traces endpoint returned ${res.status}`);
    const body = await res.json();
    assert.ok(body.data, 'Should have data array');
    recentTraces = body.data;
    console.log(`  Found ${recentTraces.length} recent traces`);
    assert.ok(recentTraces.length > 0, 'Should have at least one trace');
  });

  it('2. LiteLLM trace from last 60s exists', async () => {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const recent = recentTraces.filter((t) => t.timestamp >= cutoff);
    console.log(`  Traces in last 60s: ${recent.length}`);
    assert.ok(recent.length > 0, 'Should have a trace from the last 60s');
  });

  it('3. Trace has generations', async () => {
    if (recentTraces.length === 0) {
      assert.fail('No traces available');
    }
    const traceId = recentTraces[0].id;
    const res = await fetchLangfuse(`/api/public/observations?traceId=${traceId}&type=GENERATION`);
    assert.equal(res.status, 200, `Observations returned ${res.status}`);
    const body = await res.json();
    console.log(`  Trace ${traceId}: ${body.data?.length || 0} generations`);
    assert.ok(body.data && body.data.length > 0, 'Trace should have at least one generation');
  });

  it('4. Latency check — trace latency < 30s', async () => {
    if (recentTraces.length === 0) {
      assert.fail('No traces available');
    }
    const trace = recentTraces[0];
    if (trace.latency != null) {
      console.log(`  Trace latency: ${trace.latency}ms`);
      assert.ok(trace.latency < 30_000, `Latency too high: ${trace.latency}ms`);
    } else if (trace.timestamp && trace.endTime) {
      const latency = new Date(trace.endTime) - new Date(trace.timestamp);
      console.log(`  Computed latency: ${latency}ms`);
      assert.ok(latency < 30_000, `Latency too high: ${latency}ms`);
    } else {
      console.log('  No latency data available, skipping check');
    }
  });
});
