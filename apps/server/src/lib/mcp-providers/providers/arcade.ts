import type {
  MCPProvider,
  MCPConnection,
  MCPTool,
  MCPProviderConfig,
  MCPContext,
  MCPProviderStatus,
  MCPAuthResponse,
  ToolkitInfo,
} from '../types';
import type { ToolDefinition } from '@arcadeai/arcadejs/resources/tools/tools';
import { Arcade } from '@arcadeai/arcadejs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export class ArcadeProvider implements MCPProvider {
  name = 'arcade';
  type = 'arcade' as const;
  version = '1.0.0';
  description = 'Arcade AI toolkit provider for GitHub, Linear, Stripe and more';

  private client?: Arcade;
  private toolCache = new Map<string, MCPTool>();
  private authCache = new Map<string, string>();
  private initialized = false;

  async init(config: MCPProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Arcade API key required',
      });
    }

    this.client = new Arcade({ apiKey: config.apiKey });
    this.initialized = true;
    console.log('[ArcadeProvider] Initialized with API key');
  }

  async connect(userId: string): Promise<MCPConnection> {
    if (!this.client) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      const connections = await this.client.admin.userConnections.list();

      return {
        id: `arcade-${userId}`,
        userId,
        providerId: this.name,
        providerType: this.type,
        status: 'connected',
        metadata: {
          connections: connections.items,
          connectionCount: connections.items.length,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error('[ArcadeProvider] Failed to connect:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to establish connection',
      });
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    this.toolCache.clear();
    console.log(`[ArcadeProvider] Disconnected: ${connectionId}`);
  }

  async listToolkits(): Promise<ToolkitInfo[]> {
    if (!this.client) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      const githubTools = await this.client.tools.list({ toolkit: 'github' });
      const linearTools = await this.client.tools.list({ toolkit: 'linear' });

      const allTools = [...githubTools.items, ...linearTools.items];

      const groupedToolkits = allTools.reduce(
        (acc: Record<string, ToolkitInfo>, tool: ToolDefinition) => {
          const toolkitName = tool.toolkit?.name || 'default';
          if (!acc[toolkitName]) {
            acc[toolkitName] = {
              name: toolkitName,
              description: tool.toolkit?.description || `${toolkitName} toolkit`,
              toolCount: 0,
              tools: [],
            };
          }
          acc[toolkitName].toolCount++;
          acc[toolkitName].tools?.push(this.convertToolDefinitionToMCPTool(tool));
          return acc;
        },
        {},
      );

      return Object.values(groupedToolkits);
    } catch (error) {
      console.error('[ArcadeProvider] Failed to list toolkits:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch toolkits',
      });
    }
  }

  async listTools(userId?: string): Promise<MCPTool[]> {
    if (!this.client) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    const allTools: MCPTool[] = [];

    if (userId) {
      try {
        const userConnections = await this.client.admin.userConnections.list();

        if (!userConnections.items || userConnections.items.length === 0) {
          console.log('[ArcadeProvider] No connections found for user');
          return [];
        }

        for (const connection of userConnections.items) {
          const toolkit = connection.provider_id;
          if (!toolkit) continue;

          try {
            const toolkitName = toolkit.split('-')[0];
            const tools = await this.client.tools.list({ toolkit: toolkitName });

            for (const tool of tools.items) {
              const mcpTool = this.convertToolDefinitionToMCPTool(tool, userId);
              this.toolCache.set(mcpTool.qualifiedName || mcpTool.name, mcpTool);
              allTools.push(mcpTool);
            }
          } catch (error) {
            console.error(`[ArcadeProvider] Failed to fetch tools for toolkit ${toolkit}:`, error);
          }
        }
      } catch (error) {
        console.error('[ArcadeProvider] Failed to list user connections:', error);
      }
    } else {
      const toolkits = ['github', 'linear'];
      for (const toolkit of toolkits) {
        try {
          const tools = await this.client.tools.list({ toolkit });
          for (const tool of tools.items) {
            const mcpTool = this.convertToolDefinitionToMCPTool(tool);
            this.toolCache.set(mcpTool.qualifiedName || mcpTool.name, mcpTool);
            allTools.push(mcpTool);
          }
        } catch (error) {
          console.error(`[ArcadeProvider] Failed to fetch tools for ${toolkit}:`, error);
        }
      }
    }

    return allTools;
  }

  async getTool(toolName: string): Promise<MCPTool | null> {
    return this.toolCache.get(toolName) || null;
  }

  async executeTool(toolName: string, params: unknown, context: MCPContext): Promise<unknown> {
    if (!this.client) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      console.log(`[ArcadeProvider] Executing ${toolName} with params:`, params);

      const result = await this.client.tools.execute({
        tool_name: toolName,
        input: params as Record<string, unknown>,
        user_id: context.userId,
      });

      if (result && (result as { success?: boolean }).success !== false) {
        const output = (result as { output?: unknown }).output;
        return {
          content: [
            {
              type: 'text' as const,
              text: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
            },
          ],
        };
      } else {
        const errorResult = result as { error?: string; message?: string } | undefined;
        throw new Error(errorResult?.error || errorResult?.message || 'Tool execution failed');
      }
    } catch (error) {
      console.error(`[ArcadeProvider] Error executing ${toolName}:`, error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to execute ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  async getAuthUrl(
    userId: string,
    toolkit: string = 'github',
    scopes: string[] = [],
  ): Promise<MCPAuthResponse> {
    if (!this.client) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      const authResponse = await this.client.auth.start(userId, toolkit, {
        providerType: 'oauth2',
        scopes,
      });

      // Debug logging to identify the issue
      console.log('[ArcadeProvider] Raw auth response type:', typeof authResponse);
      console.log('[ArcadeProvider] Raw auth response keys:', Object.keys(authResponse));

      // Create a completely clean object to avoid DataCloneError
      // Use JSON stringify/parse to ensure complete serializability
      const cleanResponse = JSON.parse(
        JSON.stringify({
          status: authResponse.status || 'pending',
          authId: authResponse.id || userId,
          url: authResponse.url || '',
        }),
      );

      console.log('[ArcadeProvider] Clean response:', cleanResponse);

      if (cleanResponse.status === 'completed') {
        this.authCache.set(`${userId}-${cleanResponse.authId}`, toolkit);
        return {
          authId: cleanResponse.authId,
          status: 'completed' as const,
        };
      }

      if (authResponse.id) {
        this.authCache.set(`${userId}-${cleanResponse.authId}`, toolkit);
      }

      return {
        url: cleanResponse.url,
        authId: cleanResponse.authId,
        status: 'pending' as const,
      };
    } catch (error) {
      console.error('[ArcadeProvider] Failed to get auth URL:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start authorization',
      });
    }
  }

  async verifyAuth(authId: string, flowId?: string): Promise<boolean> {
    if (!this.client) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      if (flowId) {
        const result = await this.client.auth.confirmUser({
          flow_id: flowId,
          user_id: authId.split('-')[0],
        });

        const authResponse = await this.client.auth.waitForCompletion(result.auth_id);
        return authResponse.status === 'completed';
      } else {
        const authStatus = await this.client.auth.status({ id: authId });
        return authStatus.status === 'completed';
      }
    } catch (error) {
      console.error('[ArcadeProvider] Failed to verify auth:', error);
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async listConnections(_userId: string): Promise<unknown[]> {
    if (!this.client) {
      return [];
    }

    try {
      const connections = await this.client.admin.userConnections.list();
      return connections.items;
    } catch (error) {
      console.error('[ArcadeProvider] Failed to list connections:', error);
      return [];
    }
  }

  async revokeConnection(connectionId: string, userId: string): Promise<void> {
    if (!this.client) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      await this.client.admin.userConnections.delete(connectionId, {
        body: {
          user: userId,
          provider: connectionId.split('-')[1],
        },
      });
    } catch (error) {
      console.error('[ArcadeProvider] Failed to revoke connection:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to revoke authorization',
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) return false;
      await this.client.tools.list({ toolkit: 'github', limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  getStatus(): MCPProviderStatus {
    return {
      healthy: this.initialized,
      initialized: this.initialized,
      activeConnections: this.toolCache.size,
    };
  }

  private convertToolDefinitionToMCPTool(arcadeTool: ToolDefinition, userId?: string): MCPTool {
    const description =
      arcadeTool.description || `${arcadeTool.name} from ${arcadeTool.toolkit?.name}`;

    const zodSchema = this.parseArcadeSchema(arcadeTool.input?.parameters);

    const mcpTool: MCPTool = {
      name: arcadeTool.name,
      qualifiedName: arcadeTool.qualified_name,
      description,
      inputSchema: zodSchema,
      provider: `arcade:${arcadeTool.toolkit?.name || 'unknown'}`,
      category: arcadeTool.toolkit?.name,
    };

    if (userId && this.client) {
      const client = this.client;
      mcpTool.execute = async (params: unknown) => {
        const result = await client.tools.execute({
          tool_name: arcadeTool.qualified_name,
          input: params as Record<string, unknown>,
          user_id: userId,
        });

        if (result && (result as { success?: boolean }).success !== false) {
          return (result as { output?: unknown }).output;
        } else {
          const errorResult = result as { error?: string; message?: string } | undefined;
          throw new Error(errorResult?.error || errorResult?.message || 'Tool execution failed');
        }
      };
    }

    return mcpTool;
  }

  private parseArcadeSchema(schema: unknown): z.ZodTypeAny {
    if (!schema) return z.object({}) as z.ZodTypeAny;

    if (Array.isArray(schema)) {
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const param of schema) {
        let fieldSchema: z.ZodTypeAny;

        const valType = (param as { value_schema?: { val_type?: string } }).value_schema?.val_type;

        if (valType === 'string') {
          fieldSchema = z.string() as z.ZodTypeAny;
        } else if (valType === 'number' || valType === 'integer' || valType === 'float') {
          fieldSchema = z.number() as z.ZodTypeAny;
        } else if (valType === 'boolean') {
          fieldSchema = z.boolean() as z.ZodTypeAny;
        } else if (valType === 'array') {
          const itemsType = (param as { value_schema?: { items?: { val_type?: string } } })
            .value_schema?.items?.val_type;
          let itemSchema: z.ZodTypeAny = z.any();

          if (itemsType === 'string') {
            itemSchema = z.string() as z.ZodTypeAny;
          } else if (itemsType === 'number' || itemsType === 'integer' || itemsType === 'float') {
            itemSchema = z.number() as z.ZodTypeAny;
          } else if (itemsType === 'boolean') {
            itemSchema = z.boolean() as z.ZodTypeAny;
          } else if (itemsType === 'object') {
            itemSchema = z.object({}) as z.ZodTypeAny;
          }

          fieldSchema = z.array(itemSchema) as z.ZodTypeAny;
        } else if (valType === 'object') {
          const properties = (param as { value_schema?: { properties?: unknown } }).value_schema
            ?.properties;
          if (properties) {
            fieldSchema = this.parseArcadeSchema(properties);
          } else {
            fieldSchema = z.object({}) as z.ZodTypeAny;
          }
        } else {
          fieldSchema = z.any();
        }

        const paramObj = param as {
          description?: string;
          default?: unknown;
          required?: boolean;
          name: string;
        };
        if (paramObj.description) {
          fieldSchema = fieldSchema.describe(paramObj.description);
        }

        if (paramObj.default !== undefined) {
          fieldSchema = fieldSchema.default(paramObj.default);
        }

        if (!paramObj.required) {
          fieldSchema = fieldSchema.optional();
        }

        shape[paramObj.name] = fieldSchema;
      }

      return z.object(shape);
    }

    const schemaObj = schema as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    if (schemaObj.type === 'object' && schemaObj.properties) {
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const [key, value] of Object.entries(schemaObj.properties)) {
        let fieldSchema: z.ZodTypeAny;
        const valueObj = value as {
          type?: string;
          description?: string;
          default?: unknown;
          items?: unknown;
        };

        if (valueObj.type === 'string') {
          fieldSchema = z.string() as z.ZodTypeAny;
        } else if (valueObj.type === 'number' || valueObj.type === 'integer') {
          fieldSchema = z.number() as z.ZodTypeAny;
        } else if (valueObj.type === 'boolean') {
          fieldSchema = z.boolean() as z.ZodTypeAny;
        } else if (valueObj.type === 'array') {
          fieldSchema = z.array(this.parseArcadeSchema(valueObj.items || {})) as z.ZodTypeAny;
        } else if (valueObj.type === 'object') {
          fieldSchema = this.parseArcadeSchema(value);
        } else {
          fieldSchema = z.any();
        }

        if (valueObj.description) {
          fieldSchema = fieldSchema.describe(valueObj.description);
        }

        if (valueObj.default !== undefined) {
          fieldSchema = fieldSchema.default(valueObj.default);
        }

        if (!schemaObj.required?.includes(key)) {
          fieldSchema = fieldSchema.optional();
        }

        shape[key] = fieldSchema;
      }

      return z.object(shape) as z.ZodTypeAny;
    }

    return z.any();
  }
}
