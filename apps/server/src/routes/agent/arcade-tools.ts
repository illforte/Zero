import type { ToolDefinition } from '@arcadeai/arcadejs/resources/tools/tools';
import { connection } from '../../db/schema';
import { Arcade } from '@arcadeai/arcadejs';
import { createDb } from '../../db';
import { eq } from 'drizzle-orm';
import { env } from '../../env';
import { tool } from 'ai';
import { z } from 'zod';

const getArcadeClient = () => {
  if (!env.ARCADE_API_KEY) {
    console.warn('[Arcade Tools] API key not configured');
    return null;
  }
  return new Arcade({ apiKey: env.ARCADE_API_KEY });
};

const parseArcadeSchema = (schema): z.ZodTypeAny => {
  if (!schema) return z.object({});

  if (Array.isArray(schema)) {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const param of schema) {
      let fieldSchema: z.ZodTypeAny;

      const valType = param.value_schema?.val_type;

      if (valType === 'string') {
        fieldSchema = z.string();
      } else if (valType === 'number' || valType === 'integer' || valType === 'float') {
        fieldSchema = z.number();
      } else if (valType === 'boolean') {
        fieldSchema = z.boolean();
      } else if (valType === 'array') {
        const itemsType = param.value_schema?.items?.val_type;
        let itemSchema = z.any();

        if (itemsType === 'string') {
          itemSchema = z.string();
        } else if (itemsType === 'number' || itemsType === 'integer' || itemsType === 'float') {
          itemSchema = z.number();
        } else if (itemsType === 'boolean') {
          itemSchema = z.boolean();
        } else if (itemsType === 'object') {
          itemSchema = z.object({});
        }

        fieldSchema = z.array(itemSchema);
      } else if (valType === 'object') {
        if (param.value_schema?.properties) {
          fieldSchema = parseArcadeSchema(param.value_schema.properties);
        } else {
          fieldSchema = z.object({});
        }
      } else {
        fieldSchema = z.any();
      }

      if (param.description) {
        fieldSchema = fieldSchema.describe(param.description);
      }

      if (param.default !== undefined) {
        fieldSchema = fieldSchema.default(param.default);
      }

      if (!param.required) {
        fieldSchema = fieldSchema.optional();
      }

      shape[param.name] = fieldSchema;
    }

    return z.object(shape);
  }

  if (schema.type === 'object' && schema.properties) {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, value] of Object.entries(schema.properties as Record<string, any>)) {
      let fieldSchema: z.ZodTypeAny;

      if (value.type === 'string') {
        fieldSchema = z.string();
      } else if (value.type === 'number' || value.type === 'integer') {
        fieldSchema = z.number();
      } else if (value.type === 'boolean') {
        fieldSchema = z.boolean();
      } else if (value.type === 'array') {
        fieldSchema = z.array(parseArcadeSchema(value.items || {}));
      } else if (value.type === 'object') {
        fieldSchema = parseArcadeSchema(value);
      } else {
        fieldSchema = z.any();
      }

      if (value.description) {
        fieldSchema = fieldSchema.describe(value.description);
      }

      if (value.default !== undefined) {
        fieldSchema = fieldSchema.default(value.default);
      }

      if (!schema.required?.includes(key)) {
        fieldSchema = fieldSchema.optional();
      }

      shape[key] = fieldSchema;
    }

    return z.object(shape);
  }

  return z.any();
};

const convertArcadeToolToAITool = (arcadeTool: ToolDefinition, arcade: Arcade, userId: string) => {
  const toolWithDef = arcadeTool;
  const description =
    toolWithDef.description || `${arcadeTool.name} from ${arcadeTool.toolkit?.name}`;
  const parameters = toolWithDef.input.parameters;

  console.log(`[Arcade Tool] Parameters:`, parameters);

  const zodSchema = parseArcadeSchema(parameters);

  return tool({
    description: description,
    parameters: zodSchema,
    execute: async (params) => {
      try {
        console.log(`[Arcade Tool] Executing ${arcadeTool.name} with params:`, params);

        const result = await arcade.tools.execute({
          tool_name: arcadeTool.qualified_name,
          input: params,
          user_id: userId,
        });

        if (result && result.success !== false) {
          const output = result.output;
          return {
            content: [
              {
                type: 'text' as const,
                text: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
              },
            ],
          };
        } else {
          throw new Error(result?.error || result?.message || 'Tool execution failed');
        }
      } catch (error) {
        console.error(`[Arcade Tool] Error executing ${arcadeTool.name}:`, error);
        throw new Error(
          `Failed to execute ${arcadeTool.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
};

export const getArcadeTools = async (userId: string): Promise<Record<string, any>> => {
  const arcade = getArcadeClient();
  if (!arcade) {
    return {};
  }

  try {
    const { conn } = createDb(env.HYPERDRIVE.connectionString);

    const userConnections = await arcade.admin.userConnections.list({
      user: userId!,
    });

    await conn.end();

    if (!userConnections.items || userConnections.items.length === 0) {
      console.log('[Arcade Tools] No Arcade connections found for user');
      return {};
    }

    console.log(`[Arcade Tools] Found ${userConnections.items.length} connections for user`);

    const tools: Record<string, any> = {};

    for (const userConnection of userConnections.items) {
      const toolkit = userConnection.provider || userConnection.provider_id;

      if (!toolkit) {
        console.log('[Arcade Tools] Skipping connection with no provider');
        continue;
      }

      try {
        console.log(`[Arcade Tools] Fetching tools for toolkit: ${toolkit.split('-')[0]}`);
        const toolsList = await arcade.tools.list({ toolkit: toolkit.split('-')[0] });
        console.log(`[Arcade Tools] Found ${toolsList.items.length} tools in ${toolkit}`);

        for (const arcadeTool of toolsList.items) {
          const toolKey = `arcade_${toolkit}_${arcadeTool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');

          tools[toolKey] = convertArcadeToolToAITool(arcadeTool, arcade, userId);

          console.log(`[Arcade Tools] Loaded tool:`, tools[toolKey]);
        }
      } catch (error) {
        console.error(`[Arcade Tools] Failed to fetch tools for toolkit ${toolkit}:`, error);
      }
    }

    console.log(`[Arcade Tools] Loaded ${Object.keys(tools).length} tools for user ${userId}`);

    return tools;
  } catch (error) {
    console.error('[Arcade Tools] Error loading Arcade tools:', error);
    return {};
  }
};

export const getArcadeToolsForConnection = async (
  connectionId: string,
): Promise<Record<string, any>> => {
  try {
    const { db, conn } = createDb(env.HYPERDRIVE.connectionString);

    const connectionData = await db.query.connection.findFirst({
      where: eq(connection.id, connectionId),
    });

    await conn.end();

    if (!connectionData) {
      console.error('[Arcade Tools] Connection not found:', connectionId);
      return {};
    }

    return await getArcadeTools(connectionData.userId);
  } catch (error) {
    console.error('[Arcade Tools] Error getting tools for connection:', error);
    return {};
  }
};
