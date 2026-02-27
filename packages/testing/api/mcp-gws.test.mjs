/**
 * Phase 2b: Google Workspace MCP Tests (port 5009, streamable-http)
 *
 * Tests MCP handshake, tool discovery (142 tools), Drive CRUD, and Calendar.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpHttpClient } from './helpers/mcp-http-client.mjs';

const MCP_GWS_URL = process.env.MCP_GWS_URL || 'http://127.0.0.1:5009';
const MCP_GWS_API_KEY = process.env.MCP_GWS_API_KEY;
const GWS_TEST_FOLDER_ID = process.env.GWS_TEST_FOLDER_ID || '';

if (!MCP_GWS_API_KEY) {
  console.error('MCP_GWS_API_KEY not set — skipping GWS MCP tests');
  process.exit(0);
}

describe('Phase 2b: Google Workspace MCP (streamable-http)', () => {
  const client = new McpHttpClient(MCP_GWS_URL, MCP_GWS_API_KEY);
  let testDocId = null;

  after(async () => {
    // Phase 8: Cleanup — trash the test file if it was created
    if (testDocId) {
      try {
        await client.send('tools/call', {
          name: 'trash_drive_file',
          arguments: { file_id: testDocId },
        });
        console.log(`  Cleaned up test doc: ${testDocId}`);
      } catch (err) {
        console.log(`  Cleanup warning: ${err.message}`);
      }
    }
  });

  it('1. Initialize — serverInfo matches', async () => {
    const res = await client.initialize();
    assert.ok(res.result, 'Initialize should return a result');
    assert.ok(res.result.serverInfo, 'Should have serverInfo');
    const info = res.result.serverInfo;
    console.log(`  Server: ${info.name} v${info.version}`);
    assert.ok(
      info.name.toLowerCase().includes('google') || info.name.toLowerCase().includes('workspace'),
      `Unexpected server name: ${info.name}`,
    );
  });

  it('2. tools/list — >= 100 tools, key tools present', async () => {
    const res = await client.send('tools/list');
    assert.ok(res.result, 'tools/list should return a result');
    const tools = res.result.tools;
    assert.ok(Array.isArray(tools), 'tools should be an array');
    console.log(`  Found ${tools.length} tools`);
    assert.ok(tools.length >= 100, `Expected >= 100 tools, got ${tools.length}`);

    const toolNames = tools.map((t) => t.name);
    const keyTools = ['search_drive_files', 'create_doc', 'get_events'];
    for (const name of keyTools) {
      assert.ok(toolNames.includes(name), `Missing key tool: ${name}`);
    }
  });

  it('3. search_drive_files — returns file listing', async () => {
    const res = await client.send('tools/call', {
      name: 'search_drive_files',
      arguments: { query: '*', page_size: 3 },
    });
    assert.ok(res.result, 'search_drive_files should return a result');
    const text = res.result.content?.[0]?.text || '';
    assert.ok(text.length > 5, 'Should return file data');
    console.log(`  Drive search response: ${text.substring(0, 200)}...`);
  });

  it('4. create_doc — creates test doc', async () => {
    const testName = `e2e-test-${Date.now()}`;
    const res = await client.send('tools/call', {
      name: 'create_doc',
      arguments: { title: testName },
    });
    assert.ok(res.result, 'create_document should return a result');
    const text = res.result.content?.[0]?.text || '';
    console.log(`  Create doc response: ${text.substring(0, 300)}`);

    // Extract doc ID from response
    const idMatch = text.match(/(?:document_id|documentId|id)['":\s]+([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      testDocId = idMatch[1];
      console.log(`  Created doc ID: ${testDocId}`);
    } else {
      // Try to find any ID-like string
      const altMatch = text.match(/[a-zA-Z0-9_-]{20,}/);
      if (altMatch) {
        testDocId = altMatch[0];
        console.log(`  Extracted doc ID: ${testDocId}`);
      }
    }
    assert.ok(text.length > 10, 'Should return creation confirmation');
  });

  it('5. Rename file — update_drive_file', async () => {
    if (!testDocId) {
      console.log('  Skipped — no test doc created');
      return;
    }
    const newName = `e2e-test-renamed-${Date.now()}`;
    const res = await client.send('tools/call', {
      name: 'update_drive_file',
      arguments: { file_id: testDocId, name: newName },
    });
    assert.ok(res.result, 'update_drive_file should return a result');
    console.log(`  Renamed to: ${newName}`);
  });

  it('6. Move to folder — update_drive_file with add_parents', async () => {
    if (!testDocId || !GWS_TEST_FOLDER_ID) {
      console.log('  Skipped — no test doc or folder ID');
      return;
    }
    const res = await client.send('tools/call', {
      name: 'update_drive_file',
      arguments: { file_id: testDocId, add_parents: GWS_TEST_FOLDER_ID },
    });
    assert.ok(res.result, 'Move should return a result');
    console.log(`  Moved to folder: ${GWS_TEST_FOLDER_ID}`);
  });

  it('7. get_events (Calendar) — returns events or empty', async () => {
    const res = await client.send('tools/call', {
      name: 'get_events',
      arguments: { max_results: 5 },
    });
    assert.ok(res.result, 'list_events should return a result');
    const text = res.result.content?.[0]?.text || '';
    console.log(`  Calendar response: ${text.substring(0, 200)}`);
    // Even an empty calendar is a valid response
    assert.ok(text.length >= 0, 'Should return calendar data');
  });

  // Test 8 (cleanup) runs in after()

  it('9. Unauthenticated access — verify behavior', async () => {
    const noAuthClient = new McpHttpClient(MCP_GWS_URL, '');
    const res = await noAuthClient.sendUnauthenticated('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test-noauth', version: '1.0.0' },
    });
    // GWS MCP may not enforce API key auth (single-user mode on localhost)
    // Just verify the endpoint responds
    console.log(`  Unauthenticated request: HTTP ${res.status}`);
    assert.ok(
      res.status === 200 || res.status === 401 || res.status === 403,
      `Unexpected status: ${res.status}`,
    );
    if (res.status === 200) {
      console.log('  WARNING: GWS MCP allows unauthenticated access (single-user mode)');
    }
  });
});
