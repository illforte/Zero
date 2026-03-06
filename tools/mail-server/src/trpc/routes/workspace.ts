import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { activeConnectionProcedure, router } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

async function getMcpClient(userEmail?: string) {
  const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:5009/mcp"));
  const client = new Client({ name: "mail-zero-workspace", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

export const workspaceRouter = router({
  getDriveFiles: activeConnectionProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        const { client } = await getMcpClient();
        const userEmail = ctx.activeConnection.email;
        
        const response = await client.callTool({
          name: 'search_drive_files',
          arguments: {
            query: input.query || "mimeType != 'application/vnd.google-apps.folder'",
            user_google_email: userEmail,
            page_size: 10
          }
        });
        
        const contentArray = response.content as Array<{ type: string; text: string }>;
        const content = contentArray?.[0]?.type === 'text' ? contentArray[0].text : 'No data';
        
        if (content.startsWith('No files found')) {
          return [{ id: 'empty', name: 'No files found in your Google Drive.', type: 'Info', modifiedAt: new Date().toISOString() }];
        }

        const files = [];
        const lines = content.split('\n');
        for (const line of lines) {
          // Parse format: - Name: "Filename" (ID: 123, Type: text/plain, Size: 62, Modified: 2026-03-06T15:19:10.136Z) Link: https://...
          const match = line.match(/- Name: "(.*?)" \(ID: (.*?), Type: (.*?),.*?Modified: (.*?)\) Link: (.*)/);
          if (match) {
            files.push({
              id: match[2],
              name: `[${match[1]}](${match[5]})`,
              type: match[3],
              modifiedAt: match[4]
            });
          }
        }
        
        if (files.length === 0 && content !== 'No data') {
          return [{ id: '1', name: content, type: 'MCP Document', modifiedAt: new Date().toISOString() }];
        }

        return files;
      } catch (err) {
        console.error("MCP Drive fetch error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        return [{ id: 'error', name: errMsg, type: 'Auth Required', modifiedAt: new Date().toISOString() }];
      }
    }),

  getCalendarEvents: activeConnectionProcedure
    .input(z.object({ timeMin: z.string().optional(), timeMax: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        const { client } = await getMcpClient();
        const userEmail = ctx.activeConnection.email;
        
        const response = await client.callTool({
          name: 'get_events',
          arguments: {
            user_google_email: userEmail,
            max_results: 10
          }
        });
        
        const contentArray = response.content as Array<{ type: string; text: string }>;
        const content = contentArray?.[0]?.type === 'text' ? contentArray[0].text : 'No data';
        
        return [{ id: '1', summary: content, start: new Date().toISOString(), end: new Date().toISOString() }];
      } catch (err) {
        console.error("MCP Calendar fetch error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        return [{ id: 'error', summary: errMsg, start: new Date().toISOString(), end: new Date().toISOString() }];
      }
    }),
});
