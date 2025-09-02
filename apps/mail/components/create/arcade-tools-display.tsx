import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useArcadeTools } from '@/hooks/use-arcade-tools';
import { Info, Wrench } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';

export function ArcadeToolsDisplay() {
  const { isLoading, error, getUniqueToolkits, getToolsByToolkit, hasTools } = useArcadeTools();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (!hasTools) {
    return null;
  }

  const toolkits = getUniqueToolkits();

  console.log(toolkits);

  return (
    <div className="relative z-[200] border-t border-gray-200 px-2 py-2 dark:border-gray-800">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Wrench className="h-3 w-3" />
        <span>Available Tools:</span>
        <div className="flex flex-wrap gap-1">
          {toolkits.map((toolkit) => {
            const toolkitTools = getToolsByToolkit(toolkit);
            return (
              <TooltipProvider key={toolkit}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="cursor-help px-2 py-0.5 text-xs capitalize"
                    >
                      {toolkit} ({toolkitTools.length})
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-semibold capitalize">{toolkit} Tools</p>
                      <ul className="space-y-0.5 text-xs">
                        {toolkitTools.slice(0, 5).map((tool) => (
                          <li key={`${tool.toolkit}-${tool.toolName}`} className="text-gray-300">
                            • {tool.toolName}
                          </li>
                        ))}
                        {toolkitTools.length > 5 && (
                          <li className="italic text-gray-400">
                            ...and {toolkitTools.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 cursor-help text-gray-400" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">
                These external tools are now integrated with Zero&apos;s AI via MCP. Just ask Zero
                to perform actions using your connected services.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
