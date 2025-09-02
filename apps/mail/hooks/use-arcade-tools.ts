import { useTRPC } from '../providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export interface UserConnection {
  connection_id?: string;
  connection_status?: string;
  id?: string;
  provider?: string;
  provider_description?: string;
  provider_id?: string;
  provider_user_info?: unknown;
  scopes?: string[];
  user_id?: string;
}

export interface ArcadeTool {
  toolkit: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function useArcadeTools() {
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [tools, setTools] = useState<ArcadeTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trpc = useTRPC();

  const {
    data: connectionsData,
    isLoading: connectionsLoading,
    error: connectionsError,
  } = useQuery(trpc.arcadeConnections.list.queryOptions());

  const {
    data: toolsData,
    isLoading: toolsLoading,
    error: toolsError,
  } = useQuery(trpc.arcadeConnections.getAvailableTools.queryOptions());

  useEffect(() => {
    if (connectionsData?.connections) {
      setConnections(connectionsData.connections);
    }
    if (toolsData?.tools) {
      setTools(toolsData.tools);
    }

    setIsLoading(connectionsLoading || toolsLoading);

    if (connectionsError) {
      setError(connectionsError.message);
    } else if (toolsError) {
      setError(toolsError.message);
    }
  }, [connectionsData, toolsData, connectionsLoading, toolsLoading, connectionsError, toolsError]);

  const refreshTools = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Manual refresh would require a query refetch
      // This is handled by the useQuery hook automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tools');
    } finally {
      setIsLoading(false);
    }
  };

  const getToolsByToolkit = (toolkit: string) => {
    return tools.filter((tool) => tool.toolkit === toolkit);
  };

  const getUniqueToolkits = () => {
    return [...new Set(tools.map((tool) => tool.toolkit))];
  };

  const getConnectionsForToolkit = (toolkit: string) => {
    return connections.filter((conn) => conn.provider_id === toolkit || conn.provider === toolkit);
  };

  return {
    connections,
    tools,
    isLoading,
    error,
    refreshTools,
    getToolsByToolkit,
    getUniqueToolkits,
    getConnectionsForToolkit,
    hasTools: tools.length > 0,
    hasConnections: connections.length > 0,
  };
}
