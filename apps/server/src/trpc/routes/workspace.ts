import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { protectedProcedure, router } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

async function getMcpClient(userEmail?: string) {
  const transport = new SSEClientTransport(new URL("http://127.0.0.1:5009/sse"));
  const client = new Client({ name: "mail-zero-workspace", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

export const workspaceRouter = router({
  getDriveFiles: protectedProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        const { client } = await getMcpClient();
        const userEmail = ctx.sessionUser.email;
        
        const response = await client.callTool({
          name: 'search_drive_files',
          arguments: {
            query: input.query || "mimeType != 'application/vnd.google-apps.folder'",
            user_google_email: userEmail,
            page_size: 10
          }
        });
        
        const content = response.content?.[0]?.type === 'text' ? response.content[0].text : 'No data';
        
        return [{ id: '1', name: content, type: 'MCP Document', modifiedAt: new Date().toISOString() }];
      } catch (err) {
        console.error("MCP Drive fetch error:", err);
        return [{ id: 'error', name: 'Failed to connect to Google Workspace MCP. It may not be running on this server.', type: 'Error', modifiedAt: new Date().toISOString() }];
      }
    }),

  getCalendarEvents: protectedProcedure
    .input(z.object({ timeMin: z.string().optional(), timeMax: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        const { client } = await getMcpClient();
        const userEmail = ctx.sessionUser.email;
        
        const response = await client.callTool({
          name: 'get_events',
          arguments: {
            user_google_email: userEmail,
            max_results: 10
          }
        });
        
        const content = response.content?.[0]?.type === 'text' ? response.content[0].text : 'No data';
        
        return [{ id: '1', summary: content, start: new Date().toISOString(), end: new Date().toISOString() }];
      } catch (err) {
        console.error("MCP Calendar fetch error:", err);
        return [{ id: 'error', summary: 'Failed to connect to Google Workspace MCP. It may not be running on this server.', start: new Date().toISOString(), end: new Date().toISOString() }];
      }
    }),
});
