/**
 * Phase 1: Health Endpoint Checks
 *
 * All 8 services must be healthy. If any fails, the entire test suite should abort.
 * Runs on lair404 against localhost services.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:3050';
const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:3051';
const MCP_EMAIL_URL = process.env.MCP_EMAIL_URL || 'http://127.0.0.1:5008';
const MCP_GWS_URL = process.env.MCP_GWS_URL || 'http://127.0.0.1:5009';
const LITELLM_URL = process.env.LITELLM_URL || 'http://127.0.0.1:4000';
const LANGFUSE_URL = process.env.LANGFUSE_URL || 'http://127.0.0.1:3032';
const IMAP_PROXY_URL = process.env.IMAP_PROXY_URL || 'http://127.0.0.1:3060';
const PG_HOST = process.env.PG_HOST || '127.0.0.1';
const PG_PORT = process.env.PG_PORT || '5436';

async function fetchWithTimeout(url, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

describe('Phase 1: Health Endpoints', () => {
  it('1. Frontend — HTTP 200', async () => {
    const res = await fetchWithTimeout(FRONTEND_URL);
    assert.equal(res.status, 200, `Frontend returned ${res.status}`);
  });

  it('2. Server /health — status ok', async () => {
    const res = await fetchWithTimeout(`${SERVER_URL}/health`);
    assert.equal(res.status, 200, `Server returned ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'ok', `Server health status: ${body.status}`);
  });

  it('3. MCP Email /health — status ok', async () => {
    const res = await fetchWithTimeout(`${MCP_EMAIL_URL}/health`);
    assert.equal(res.status, 200, `MCP Email returned ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'ok', `MCP Email health: ${body.status}`);
  });

  it('4. GWS MCP /health — status healthy', async () => {
    const res = await fetchWithTimeout(`${MCP_GWS_URL}/health`);
    assert.equal(res.status, 200, `GWS MCP returned ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'healthy', `GWS MCP health: ${body.status}`);
  });

  it('5. LiteLLM /health — HTTP 200', async () => {
    const res = await fetchWithTimeout(`${LITELLM_URL}/health`);
    assert.equal(res.status, 200, `LiteLLM returned ${res.status}`);
  });

  it('6. Langfuse /api/public/health — status OK', async () => {
    const res = await fetchWithTimeout(`${LANGFUSE_URL}/api/public/health`);
    assert.equal(res.status, 200, `Langfuse returned ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'OK', `Langfuse health: ${body.status}`);
  });

  it('7. IMAP Proxy /health — status ok', async () => {
    const res = await fetchWithTimeout(`${IMAP_PROXY_URL}/health`);
    assert.equal(res.status, 200, `IMAP Proxy returned ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'ok', `IMAP Proxy health: ${body.status}`);
  });

  it('8. PostgreSQL — pg_isready', async () => {
    try {
      execSync(`pg_isready -h ${PG_HOST} -p ${PG_PORT}`, { timeout: 5_000 });
    } catch (err) {
      assert.fail(`pg_isready failed: ${err.message}`);
    }
  });
});
