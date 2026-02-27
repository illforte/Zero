/**
 * Phase 2a: MCP Email Server Tests (port 5008, SSE transport)
 *
 * Tests the MCP protocol handshake, tool listing, and email operations.
 * The SSE server is single-client, so tests run serially.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpSseClient } from './helpers/mcp-sse-client.mjs';

const MCP_EMAIL_URL = process.env.MCP_EMAIL_URL || 'http://127.0.0.1:5008';
const MCP_EMAIL_API_KEY = process.env.MCP_EMAIL_API_KEY;

if (!MCP_EMAIL_API_KEY) {
  console.error('MCP_EMAIL_API_KEY not set — skipping MCP email tests');
  process.exit(0);
}

const EXPECTED_TOOLS = [
  'search_emails',
  'get_email_content',
  'list_labels',
  'get_mailbox_stats',
  'reply_to_email',
  'forward_email',
  'mark_as_spam',
  'delete_email',
  'archive_email',
  'send_email',
  'modify_labels',
];

describe('Phase 2a: MCP Email Protocol (SSE)', () => {
  const client = new McpSseClient(MCP_EMAIL_URL, MCP_EMAIL_API_KEY);

  after(() => {
    client.close();
  });

  it('1. SSE connection succeeds', async () => {
    await client.connect();
    assert.ok(client.connected, 'Client should be connected');
  });

  it('2. Initialize handshake', async () => {
    const res = await client.initialize();
    assert.ok(res.result, 'Initialize should return a result');
    assert.ok(res.result.serverInfo, 'Should have serverInfo');
    assert.ok(res.result.serverInfo.name, 'serverInfo should have name');
    assert.ok(res.result.protocolVersion, 'Should have protocolVersion');
    console.log(`  Server: ${res.result.serverInfo.name} v${res.result.serverInfo.version || 'unknown'}`);
    console.log(`  Protocol: ${res.result.protocolVersion}`);
  });

  it('3. tools/list — all 11 tools present', async () => {
    const res = await client.send('tools/list');
    assert.ok(res.result, 'tools/list should return a result');
    const tools = res.result.tools;
    assert.ok(Array.isArray(tools), 'tools should be an array');

    const toolNames = tools.map((t) => t.name);
    console.log(`  Found ${tools.length} tools: ${toolNames.join(', ')}`);

    for (const expected of EXPECTED_TOOLS) {
      assert.ok(toolNames.includes(expected), `Missing tool: ${expected}`);
    }
  });

  it('4. search_emails — returns array', async () => {
    const res = await client.send('tools/call', {
      name: 'search_emails',
      arguments: { query: 'in:inbox', maxResults: 3 },
    });
    assert.ok(res.result, 'search_emails should return a result');
    const content = res.result.content;
    assert.ok(Array.isArray(content), 'content should be an array');
    assert.ok(content.length > 0, 'Should return at least one content block');
    // Parse the text content to verify email data
    const text = content[0]?.text || '';
    console.log(`  Response length: ${text.length} chars`);
    assert.ok(text.length > 10, 'Response should contain email data');
  });

  it('5. list_labels — standard labels present', async () => {
    const res = await client.send('tools/call', {
      name: 'list_labels',
      arguments: {},
    });
    assert.ok(res.result, 'list_labels should return a result');
    const text = res.result.content?.[0]?.text || '';
    const standardLabels = ['INBOX', 'SENT', 'TRASH', 'SPAM', 'DRAFT'];
    for (const label of standardLabels) {
      assert.ok(text.includes(label), `Missing label: ${label}`);
    }
    console.log(`  Labels response length: ${text.length} chars`);
  });

  it('6. get_mailbox_stats — returns count data', async () => {
    const res = await client.send('tools/call', {
      name: 'get_mailbox_stats',
      arguments: {},
    });
    assert.ok(res.result, 'get_mailbox_stats should return a result');
    const text = res.result.content?.[0]?.text || '';
    assert.ok(text.length > 5, 'Stats should contain data');
    console.log(`  Stats: ${text.substring(0, 200)}`);
  });

  it('7. Auth rejection (no key) — HTTP 401', async () => {
    const noAuthClient = new McpSseClient(MCP_EMAIL_URL, '');
    try {
      await noAuthClient.connect(3_000);
      assert.fail('Should have rejected connection without API key');
    } catch (err) {
      assert.ok(
        err.message.includes('401') || err.message.includes('failed') || err.message.includes('timed out'),
        `Expected auth error, got: ${err.message}`,
      );
    } finally {
      noAuthClient.close();
    }
  });

  it('8. Auth rejection (wrong key) — HTTP 401', async () => {
    const badClient = new McpSseClient(MCP_EMAIL_URL, 'invalid-key-12345');
    try {
      await badClient.connect(3_000);
      assert.fail('Should have rejected connection with wrong key');
    } catch (err) {
      assert.ok(
        err.message.includes('401') || err.message.includes('failed') || err.message.includes('timed out'),
        `Expected auth error, got: ${err.message}`,
      );
    } finally {
      badClient.close();
    }
  });
});
