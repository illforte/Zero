import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { activeConnectionProcedure, router } from '../trpc';
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
        
        if (content.startsWith('No events found')) {
          return [{ id: 'empty', summary: 'No upcoming events found.', start: new Date().toISOString(), end: new Date().toISOString() }];
        }

        const events = [];
        const lines = content.split('\n');
        for (const line of lines) {
          // Parse format: - "Title" from 2026-03-06T10:00:00Z to 2026-03-06T10:30:00Z (ID: 1234) Link: https://...
          const match = line.match(/- "(.*?)" from (.*?) to (.*?) \(ID: (.*?)\) Link: (.*)/);
          if (match) {
            events.push({
              id: match[4],
              summary: `[${match[1]}](${match[5]})`,
              start: match[2],
              end: match[3]
            });
          }
        }
        
        if (events.length === 0 && content !== 'No data') {
          return [{ id: '1', summary: content, start: new Date().toISOString(), end: new Date().toISOString() }];
        }

        return events;
      } catch (err) {
        console.error("MCP Calendar fetch error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        return [{ id: 'error', summary: errMsg, start: new Date().toISOString(), end: new Date().toISOString() }];
      }
    }),

  searchContacts: activeConnectionProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        if (!input.query || input.query.trim() === '') {
          return [];
        }
        const { client } = await getMcpClient();
        const userEmail = ctx.activeConnection.email;
        
        const response = await client.callTool({
          name: 'search_contacts',
          arguments: {
            query: input.query,
            user_google_email: userEmail,
            page_size: 5
          }
        });
        
        const contentArray = response.content as Array<{ type: string; text: string }>;
        const content = contentArray?.[0]?.type === 'text' ? contentArray[0].text : 'No data';
        
        if (content.startsWith('No contacts found')) {
          return [];
        }

        const contacts = [];
        const lines = content.split('\n');
        for (const line of lines) {
          // Parse format: - Name (Email) - Other details...
          // We just need a simple regex for the first dash bullet points
          const match = line.match(/^- (.*?) \((.*?)\)/);
          if (match) {
            contacts.push({
              name: match[1].trim(),
              email: match[2].trim()
            });
          } else if (line.startsWith('- ')) {
            // Fallback for contacts without email or different format
            const text = line.substring(2).trim();
            if (text.includes('@')) {
              // Try to extract an email if there's an @ symbol
              const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
              if (emailMatch) {
                contacts.push({
                  name: text.replace(emailMatch[1], '').trim(),
                  email: emailMatch[1]
                });
              }
            }
          }
        }
        
        return contacts;
      } catch (err) {
        console.error("MCP Contacts search error:", err);
        return [];
      }
    }),

  createTask: activeConnectionProcedure
    .input(z.object({ 
      title: z.string(), 
      notes: z.string().optional(),
      dueDate: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { client } = await getMcpClient();
        const userEmail = ctx.activeConnection.email;
        
        // First get the primary task list ID
        const listsResponse = await client.callTool({
          name: 'list_task_lists',
          arguments: {
            user_google_email: userEmail,
            max_results: 1
          }
        });
        
        let taskListId = '@default';
        const listsContentArray = listsResponse.content as Array<{ type: string; text: string }>;
        const listsContent = listsContentArray?.[0]?.type === 'text' ? listsContentArray[0].text : '';
        
        const listMatch = listsContent.match(/- .*? \(ID: (.*?)\)/);
        if (listMatch) {
          taskListId = listMatch[1];
        }

        // Now create the task
        const response = await client.callTool({
          name: 'create_task',
          arguments: {
            user_google_email: userEmail,
            task_list_id: taskListId,
            title: input.title,
            notes: input.notes,
            due: input.dueDate
          }
        });
        
        const contentArray = response.content as Array<{ type: string; text: string }>;
        const content = contentArray?.[0]?.type === 'text' ? contentArray[0].text : 'No data';
        
        return { success: true, message: content };
      } catch (err) {
        console.error("MCP Create Task error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        return { success: false, error: errMsg };
      }
    }),
});
