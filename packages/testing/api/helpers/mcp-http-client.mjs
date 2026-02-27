/**
 * MCP Streamable-HTTP Client
 *
 * Wraps the streamable-http transport used by Google Workspace MCP (port 5009).
 * Protocol: POST /mcp with Accept: application/json, text/event-stream
 * Session managed via Mcp-Session-Id header.
 */

export class McpHttpClient {
  #baseUrl;
  #apiKey;
  #sessionId = null;
  #nextId = 1;

  /**
   * @param {string} baseUrl - e.g. "http://127.0.0.1:5009"
   * @param {string} apiKey - API key for authentication
   */
  constructor(baseUrl, apiKey) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#apiKey = apiKey;
  }

  /**
   * Send a JSON-RPC request to /mcp and parse the response.
   * Handles both direct JSON responses and SSE-wrapped responses.
   */
  async send(method, params = {}, timeoutMs = 30_000) {
    const id = this.#nextId++;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.#apiKey) {
      headers['x-api-key'] = this.#apiKey;
    }

    if (this.#sessionId) {
      headers['Mcp-Session-Id'] = this.#sessionId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.#baseUrl}/mcp`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Capture session ID from response
      const newSessionId = res.headers.get('mcp-session-id');
      if (newSessionId) {
        this.#sessionId = newSessionId;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`MCP HTTP ${res.status}: ${text}`);
      }

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        return await this.#parseSSEResponse(res);
      }

      // Direct JSON response
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Request ${method} timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  /** Parse SSE response body, extracting the last JSON-RPC result. */
  async #parseSSEResponse(res) {
    const text = await res.text();
    const lines = text.split('\n');
    let lastData = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          lastData = JSON.parse(line.slice(6));
        } catch {
          // skip non-JSON data lines
        }
      }
    }

    if (!lastData) {
      throw new Error('No valid JSON-RPC response found in SSE stream');
    }

    return lastData;
  }

  /** Perform MCP initialize handshake. */
  async initialize() {
    const res = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test-client', version: '1.0.0' },
    });

    // Send initialized notification
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.#apiKey) headers['x-api-key'] = this.#apiKey;
    if (this.#sessionId) headers['Mcp-Session-Id'] = this.#sessionId;

    await fetch(`${this.#baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    return res;
  }

  /** Send a raw unauthenticated POST to test auth rejection. */
  async sendUnauthenticated(method, params = {}) {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: this.#nextId++,
      method,
      params,
    });

    const res = await fetch(`${this.#baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body,
    });

    return { status: res.status, body: await res.text() };
  }

  get sessionId() {
    return this.#sessionId;
  }
}
