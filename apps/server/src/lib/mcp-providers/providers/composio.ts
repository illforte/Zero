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
import { Composio } from '@composio/core';
import { TRPCError } from '@trpc/server';
import { OpenAI } from 'openai';
import { z } from 'zod';

interface ComposioConnection {
  id: string;
  status: string;
  authConfig?: {
    id: string;
  };
  provider?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ComposioTool {
  function?: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
  name: string;
}

export class ComposioProvider implements MCPProvider {
  name = 'composio';
  type = 'composio' as const;
  version = '1.0.0';
  description = 'Composio toolkit provider for GitHub, Gmail, Linear and more';

  private composio?: Composio;
  private openai?: OpenAI;
  private toolCache = new Map<string, MCPTool>();
  private authCache = new Map<string, string>();
  private initialized = false;

  // Auth config IDs for different services - Put in keys @ahmet
  private readonly AUTH_CONFIGS = {
    github: 'ac_94ZkAgNrD3tT',
    stripe: 'ac_stripe',
    linear: 'ac_linear',
  };

  async init(config: MCPProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Composio API key required',
      });
    }

    this.composio = new Composio({
      apiKey: config.apiKey,
    });

    if (config.options?.openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: config.options.openaiApiKey as string,
      });
    }

    this.initialized = true;
    console.log('[ComposioProvider] Initialized with API key');
  }

  async connect(userId: string): Promise<MCPConnection> {
    if (!this.composio) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      // Get all existing connections for the user
      const allConnections = [];

      for (const [service, authConfigId] of Object.entries(this.AUTH_CONFIGS)) {
        try {
          const connections = await this.composio.connectedAccounts.list({
            userIds: [userId],
            authConfigIds: [authConfigId],
          });

          const activeConnections =
            connections?.items?.filter(
              (conn: ComposioConnection) =>
                conn.status === 'ACTIVE' && conn.authConfig?.id === authConfigId,
            ) || [];

          allConnections.push(...activeConnections);
        } catch (error) {
          console.error(`[ComposioProvider] Failed to get connections for ${service}:`, error);
        }
      }

      return {
        id: `composio-${userId}`,
        userId,
        providerId: this.name,
        providerType: this.type,
        status: allConnections.length > 0 ? 'connected' : 'disconnected',
        metadata: {
          connections: allConnections,
          connectionCount: allConnections.length,
          services: allConnections.map((conn: ComposioConnection) => conn.authConfig?.id),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error('[ComposioProvider] Failed to connect:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to establish connection',
      });
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    this.toolCache.clear();
    console.log(`[ComposioProvider] Disconnected: ${connectionId}`);
  }

  async listToolkits(): Promise<ToolkitInfo[]> {
    if (!this.composio) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    const toolkits: ToolkitInfo[] = [
      {
        name: 'github',
        description: 'GitHub toolkit for repository management, issues, and pull requests',
        toolCount: 0,
        tools: [],
      },
      {
        name: 'stripe',
        description: 'Stripe toolkit for payment processing and financial management',
        toolCount: 0,
        tools: [],
      },
      {
        name: 'linear',
        description: 'Linear toolkit for project management and issue tracking',
        toolCount: 0,
        tools: [],
      },
    ];

    // Populate tools for each toolkit
    for (const toolkit of toolkits) {
      try {
        const tools = await this.getToolsForService(toolkit.name);
        toolkit.tools = tools;
        toolkit.toolCount = tools.length;
      } catch (error) {
        console.error(`[ComposioProvider] Failed to get tools for ${toolkit.name}:`, error);
      }
    }

    return toolkits;
  }

  async listTools(userId?: string): Promise<MCPTool[]> {
    if (!this.composio) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    const allTools: MCPTool[] = [];

    if (userId) {
      // Get tools for services the user has connected
      const userConnections = await this.getUserConnections(userId);

      for (const connection of userConnections) {
        const service = this.getServiceFromAuthConfig(connection.authConfig?.id);
        if (service) {
          try {
            const tools = await this.getToolsForService(service, userId);
            allTools.push(...tools);
          } catch (error) {
            console.error(`[ComposioProvider] Failed to fetch tools for ${service}:`, error);
          }
        }
      }
    } else {
      // Get all available tools
      for (const service of Object.keys(this.AUTH_CONFIGS)) {
        try {
          const tools = await this.getToolsForService(service);
          allTools.push(...tools);
        } catch (error) {
          console.error(`[ComposioProvider] Failed to fetch tools for ${service}:`, error);
        }
      }
    }

    return allTools;
  }

  async getTool(toolName: string): Promise<MCPTool | null> {
    return this.toolCache.get(toolName) || null;
  }

  async executeTool(toolName: string, params: unknown, context: MCPContext): Promise<unknown> {
    if (!this.composio || !this.openai) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      console.log(`[ComposioProvider] Executing ${toolName} with params:`, params);

      // Get the service from the tool name
      const service = this.getServiceFromToolName(toolName);
      if (!service) {
        throw new Error(`Unknown service for tool: ${toolName}`);
      }

      // Get tools for the specific service
      const toolsForResponses = await this.composio.tools.get(context.userId, {
        tools: [toolName],
      });

      if (!toolsForResponses || toolsForResponses.length === 0) {
        throw new Error(`Tool ${toolName} not found`);
      }

      // Create a task description based on the tool and params
      const task = this.createTaskFromToolAndParams(toolName, params);

      const messages = [
        {
          role: 'system' as const,
          content: `You are a helpful assistant that can help with ${service} tasks.`,
        },
        { role: 'user' as const, content: task },
      ];

      // Create OpenAI chat completion
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: toolsForResponses,
        tool_choice: 'auto',
      });

      // Execute the tool calls
      const result = await this.composio.provider.handleToolCalls(context.userId, response);

      return {
        content: [
          {
            type: 'text' as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`[ComposioProvider] Error executing ${toolName}:`, error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to execute ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  async getAuthUrl(userId: string, toolkit: string = 'github'): Promise<MCPAuthResponse> {
    if (!this.composio) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    const authConfigId = this.AUTH_CONFIGS[toolkit as keyof typeof this.AUTH_CONFIGS];
    if (!authConfigId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Unknown toolkit: ${toolkit}`,
      });
    }

    try {
      // Check for existing connections first
      const existingConnections = await this.composio.connectedAccounts.list({
        userIds: [userId],
        authConfigIds: [authConfigId],
      });

      const activeConnections =
        existingConnections?.items?.filter(
          (conn: ComposioConnection) =>
            conn.status === 'ACTIVE' && conn.authConfig?.id === authConfigId,
        ) || [];

      if (activeConnections.length > 0) {
        return {
          authId: activeConnections[0].id,
          status: 'completed',
        };
      }

      // Initiate new connection
      const connectionRequest = await this.composio.connectedAccounts.initiate(
        userId,
        authConfigId,
        {
          allowMultiple: true,
        },
      );

      // Extract only serializable properties to avoid DataCloneError
      const authId = connectionRequest.id || `${userId}-${toolkit}`;
      const redirectUrl = connectionRequest.redirectUrl;

      this.authCache.set(`${userId}-${authId}`, toolkit);

      return {
        url: redirectUrl || '',
        authId,
        status: 'pending',
      };
    } catch (error) {
      console.error('[ComposioProvider] Failed to get auth URL:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start authorization',
      });
    }
  }

  async verifyAuth(authId: string): Promise<boolean> {
    if (!this.composio) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      // For Composio, we can check the connection status directly
      const connections = await this.composio.connectedAccounts.list({
        authConfigIds: [authId],
      });

      return (
        connections?.items?.some((conn: ComposioConnection) => conn.status === 'ACTIVE') || false
      );
    } catch (error) {
      console.error('[ComposioProvider] Failed to verify auth:', error);
      return false;
    }
  }

  async listConnections(userId: string): Promise<MCPConnection[]> {
    if (!this.composio) {
      return [];
    }

    try {
      const allConnections = [];

      for (const [service, authConfigId] of Object.entries(this.AUTH_CONFIGS)) {
        try {
          const connections = await this.composio.connectedAccounts.list({
            userIds: [userId],
            authConfigIds: [authConfigId],
          });

          const activeConnections =
            connections?.items?.filter(
              (conn: ComposioConnection) =>
                conn.status === 'ACTIVE' && conn.authConfig?.id === authConfigId,
            ) || [];

          allConnections.push(
            ...activeConnections.map((conn: ComposioConnection) => ({
              id: conn.id,
              userId,
              providerId: this.name,
              providerType: this.type,
              status: (conn.status === 'ACTIVE' ? 'connected' : 'disconnected') as
                | 'connected'
                | 'disconnected'
                | 'error',
              metadata: {
                ...conn,
                service,
              },
              createdAt: new Date(conn.createdAt || Date.now()),
              updatedAt: new Date(conn.updatedAt || Date.now()),
            })),
          );
        } catch (error) {
          console.error(`[ComposioProvider] Failed to get connections for ${service}:`, error);
        }
      }

      return allConnections;
    } catch (error) {
      console.error('[ComposioProvider] Failed to list connections:', error);
      return [];
    }
  }

  async revokeConnection(connectionId: string, userId: string): Promise<void> {
    if (!this.composio) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Provider not initialized',
      });
    }

    try {
      // For Composio, we need to find the connection and revoke it
      const connections = await this.composio.connectedAccounts.list({
        userIds: [userId],
      });

      const connection = connections?.items?.find(
        (conn: ComposioConnection) => conn.id === connectionId,
      );
      if (connection) {
        await this.composio.connectedAccounts.delete(connectionId);
      }
    } catch (error) {
      console.error('[ComposioProvider] Failed to revoke connection:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to revoke authorization',
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.composio) return false;
      // Try to list tools for GitHub as a health check
      await this.composio.tools.get('test-user', {
        tools: ['GITHUB_CREATE_ISSUE'],
      });
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

  private async getUserConnections(userId: string): Promise<ComposioConnection[]> {
    if (!this.composio) return [];

    const allConnections = [];

    for (const authConfigId of Object.values(this.AUTH_CONFIGS)) {
      try {
        const connections = await this.composio.connectedAccounts.list({
          userIds: [userId],
          authConfigIds: [authConfigId],
        });

        const activeConnections =
          connections?.items?.filter(
            (conn: ComposioConnection) =>
              conn.status === 'ACTIVE' && conn.authConfig?.id === authConfigId,
          ) || [];

        allConnections.push(...activeConnections);
      } catch (error) {
        console.error(`[ComposioProvider] Failed to get connections for ${authConfigId}:`, error);
      }
    }

    return allConnections;
  }

  private async getToolsForService(service: string, userId?: string): Promise<MCPTool[]> {
    if (!this.composio) return [];

    const toolMap = {
      github: [
        'GITHUB_CREATE_ISSUE',
        'GITHUB_CREATE_PULL_REQUEST',
        'GITHUB_LIST_REPOSITORIES',
        'GITHUB_GET_REPOSITORY',
        'GITHUB_LIST_ISSUES',
        'GITHUB_GET_ISSUE',
        'GITHUB_UPDATE_ISSUE',
        'GITHUB_CLOSE_ISSUE',
        'GITHUB_ADD_COMMENT',
      ],
      stripe: [
        'STRIPE_CREATE_CUSTOMER',
        'STRIPE_CREATE_PAYMENT_INTENT',
        'STRIPE_CREATE_SUBSCRIPTION',
        'STRIPE_LIST_CUSTOMERS',
        'STRIPE_GET_CUSTOMER',
        'STRIPE_UPDATE_CUSTOMER',
        'STRIPE_CREATE_INVOICE',
        'STRIPE_LIST_INVOICES',
        'STRIPE_GET_INVOICE',
        'STRIPE_CREATE_REFUND',
      ],
      linear: [
        'LINEAR_CREATE_ISSUE',
        'LINEAR_UPDATE_ISSUE',
        'LINEAR_LIST_ISSUES',
        'LINEAR_GET_ISSUE',
        'LINEAR_CREATE_COMMENT',
        'LINEAR_LIST_TEAMS',
        'LINEAR_GET_TEAM',
      ],
    };

    const tools = toolMap[service as keyof typeof toolMap] || [];
    const mcpTools: MCPTool[] = [];

    for (const toolName of tools) {
      try {
        const toolResponse = await this.composio.tools.get(userId || 'system', {
          tools: [toolName],
        });

        if (toolResponse && toolResponse.length > 0) {
          const tool = toolResponse[0] as unknown as ComposioTool;
          const mcpTool = this.convertComposioToolToMCPTool(tool, service, userId);
          this.toolCache.set(mcpTool.qualifiedName || mcpTool.name, mcpTool);
          mcpTools.push(mcpTool);
        }
      } catch (error) {
        console.error(`[ComposioProvider] Failed to get tool ${toolName}:`, error);
      }
    }

    return mcpTools;
  }

  private convertComposioToolToMCPTool(
    composioTool: ComposioTool,
    service: string,
    userId?: string,
  ): MCPTool {
    const mcpTool: MCPTool = {
      name: composioTool.function?.name || composioTool.name,
      qualifiedName: composioTool.function?.name || composioTool.name,
      description: composioTool.function?.description || `${service} tool`,
      inputSchema: this.parseComposioSchema(composioTool.function?.parameters),
      provider: `composio:${service}`,
      category: service,
    };

    if (userId && this.composio && this.openai) {
      const composio = this.composio;
      const openai = this.openai;

      mcpTool.execute = async (params: unknown) => {
        const toolsForResponses = await composio.tools.get(userId, {
          tools: [mcpTool.name],
        });

        const task = this.createTaskFromToolAndParams(mcpTool.name, params);
        const messages = [
          {
            role: 'system' as const,
            content: `You are a helpful assistant that can help with ${service} tasks.`,
          },
          { role: 'user' as const, content: task },
        ];

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          tools: toolsForResponses,
          tool_choice: 'auto',
        });

        const result = await composio.provider.handleToolCalls(userId, response);
        return result;
      };
    }

    return mcpTool;
  }

  private parseComposioSchema(schema: unknown): z.ZodTypeAny {
    if (!schema) return z.object({}) as z.ZodTypeAny;

    // For now, return a generic object schema
    // In a full implementation, you'd parse the Composio schema format
    return z.object({}) as z.ZodTypeAny;
  }

  private getServiceFromAuthConfig(authConfigId?: string): string | null {
    if (!authConfigId) return null;

    for (const [service, configId] of Object.entries(this.AUTH_CONFIGS)) {
      if (configId === authConfigId) {
        return service;
      }
    }

    return null;
  }

  private getServiceFromToolName(toolName: string): string | null {
    if (toolName.startsWith('GITHUB_')) return 'github';
    if (toolName.startsWith('STRIPE_')) return 'stripe';
    if (toolName.startsWith('LINEAR_')) return 'linear';
    return null;
  }

  private createTaskFromToolAndParams(toolName: string, params: unknown): string {
    const paramStr =
      typeof params === 'object' && params !== null
        ? Object.entries(params)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ')
        : String(params);

    return `Execute ${toolName} with parameters: ${paramStr}`;
  }
}
