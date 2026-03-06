import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';

export default function CalendarPage() {
  const trpc = useTRPC();
  const { data: events, isLoading } = useQuery(
    trpc.workspace.getCalendarEvents.queryOptions({})
  );

  return (
    <div className="flex flex-col p-6 w-full h-full text-black dark:text-white bg-white dark:bg-black">
      <h1 className="text-2xl font-bold mb-4">Calendar</h1>
      <p className="text-muted-foreground mb-6">Manage your upcoming Google Workspace events.</p>
      {isLoading ? (
        <div className="flex justify-center items-center h-32">
          <p>Loading events...</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {events?.map(event => (
            <li key={event.id} className="p-4 border rounded-md dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
              <div 
                className="font-semibold" 
                dangerouslySetInnerHTML={{ 
                  __html: event.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-500 hover:underline">$1</a>')
                }} 
              />
              {event.id !== 'empty' && event.id !== 'error' && event.id !== '1' && (
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(event.start).toLocaleString()} - {new Date(event.end).toLocaleString()}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
