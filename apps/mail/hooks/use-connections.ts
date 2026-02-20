import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';

export const useConnections = () => {
  const trpc = useTRPC();
  const connectionsQuery = useQuery(trpc.connections.list.queryOptions());
  return connectionsQuery;
};

export const useActiveConnection = () => {
  const trpc = useTRPC();
  const connectionsQuery = useQuery(
    trpc.connections.getDefault.queryOptions(void 0, {
      staleTime: 1000 * 60 * 5, // 5 minutes — was 1 hour, reduced so null isn't cached after login
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      refetchOnWindowFocus: false,
      refetchOnMount: 'always', // always refetch on mount so login redirect gets fresh connection
      refetchOnReconnect: false,
    }),
  );
  return connectionsQuery;
};
