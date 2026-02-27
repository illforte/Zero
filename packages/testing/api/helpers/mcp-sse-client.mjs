/**
 * MCP SSE Transport Client (native fetch, no dependencies)
 *
 * Wraps the SSE protocol used by mail-zero's MCP email server (port 5008).
 * Protocol: GET /sse opens a stream → POST /messages sends JSON-RPC.
 *
 * Uses native fetch streaming instead of EventSource for Node.js 20 compat.
 */

export class McpSseClient {
  #baseUrl;
  #apiKey;
  #messagesUrl = null;
  #pendingRequests = new Map();
  #nextId = 1;
  #connected = false;
  #abortController = null;

  /**
   * @param {string} baseUrl - e.g. "http://127.0.0.1:5008"
   * @param {string} apiKey - API key for Authorization header
   */
  constructor(baseUrl, apiKey) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#apiKey = apiKey;
  }

  /** Open SSE connection and wait for the endpoint event. */
  async connect(timeoutMs = 10_000) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
        reject(new Error(`SSE connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.#abortController = new AbortController();

      try {
        const headers = {};
        if (this.#apiKey) {
          headers['Authorization'] = `Bearer ${this.#apiKey}`;
        }

        const res = await fetch(`${this.#baseUrl}/sse`, {
          headers,
          signal: this.#abortController.signal,
        });

        if (!res.ok) {
          clearTimeout(timer);
          reject(new Error(`SSE connection failed: HTTP ${res.status}`));
          return;
        }

        // Start reading the SSE stream in background
        this.#readStream(res.body, (eventType, data) => {
          if (eventType === 'endpoint' && !this.#connected) {
            if (data.startsWith('http')) {
              this.#messagesUrl = data;
            } else {
              this.#messagesUrl = `${this.#baseUrl}${data}`;
            }
            this.#connected = true;
            clearTimeout(timer);
            resolve();
          } else if (eventType === 'message') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.id != null && this.#pendingRequests.has(parsed.id)) {
                this.#pendingRequests.get(parsed.id).resolve(parsed);
                this.#pendingRequests.delete(parsed.id);
              }
            } catch {
              // ignore non-JSON messages
            }
          }
        });
      } catch (err) {
        clearTimeout(timer);
        if (err.name !== 'AbortError') {
          reject(new Error(`SSE connection failed: ${err.message}`));
        }
      }
    });
  }

  /** Read SSE stream and dispatch events. */
  async #readStream(body, onEvent) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';
    let currentData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '') {
            if (currentData) {
              onEvent(currentEvent, currentData);
              currentEvent = 'message';
              currentData = '';
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('SSE stream error:', err.message);
      }
    }
  }

  /** Send a JSON-RPC request and wait for the response. */
  async send(method, params = {}, timeoutMs = 15_000) {
    if (!this.#connected || !this.#messagesUrl) {
      throw new Error('Not connected. Call connect() first.');
    }

    const id = this.#nextId++;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.#pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
      });
    });

    const res = await fetch(this.#messagesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {}),
      },
      body,
    });

    if (!res.ok) {
      this.#pendingRequests.delete(id);
      throw new Error(`POST /messages returned ${res.status}: ${await res.text()}`);
    }

    return responsePromise;
  }

  /** Perform MCP initialize handshake. */
  async initialize() {
    const res = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test-client', version: '1.0.0' },
    });
    // Send initialized notification (no response expected)
    if (this.#messagesUrl) {
      await fetch(this.#messagesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      });
    }
    return res;
  }

  /** Close the SSE connection. */
  close() {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
    this.#connected = false;
    this.#pendingRequests.clear();
  }

  get connected() {
    return this.#connected;
  }
}
