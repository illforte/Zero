import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';

export default function DrivePage() {
  const trpc = useTRPC();
  const { data: files, isLoading } = useQuery(
    trpc.workspace.getDriveFiles.queryOptions({ query: '' })
  );

  return (
    <div className="flex flex-col p-6 w-full h-full text-black dark:text-white bg-white dark:bg-black">
      <h1 className="text-2xl font-bold mb-4">Google Drive</h1>
      <p className="text-muted-foreground mb-6">Access and manage your Google Workspace documents.</p>
      {isLoading ? (
        <div className="flex justify-center items-center h-32">
          <p>Loading files...</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {files?.map(file => (
            <li key={file.id} className="p-4 border rounded-md dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
              <p className="font-semibold">{file.name}</p>
              <p className="text-sm text-muted-foreground">{file.type} &bull; Modified: {new Date(file.modifiedAt).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
