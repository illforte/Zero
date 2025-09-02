import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { AddArcadeConnectionDialog } from '@/components/connection/add-arcade-connection';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toolkitIcons } from '@/components/connection/add-arcade-connection';
import { useArcadeConnections } from '@/hooks/use-arcade-connection';
import { SettingsCard } from '@/components/settings/settings-card';
import { AddConnectionDialog } from '@/components/connection/add';
import { Trash, Plus, Unplug, Sparkles } from 'lucide-react';
import { useSession, authClient } from '@/lib/auth-client';
import { useConnections } from '@/hooks/use-connections';
import { useTRPC } from '@/providers/query-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutation } from '@tanstack/react-query';
import { useThreads } from '@/hooks/use-threads';
import { useBilling } from '@/hooks/use-billing';
import { emailProviders } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';
import { m } from '@/paraglide/messages';
import { useQueryState } from 'nuqs';
import { toast } from 'sonner';

export default function ConnectionsPage() {
  const { data, isLoading, refetch: refetchConnections } = useConnections();
  const {
    connections: arcadeConnections,
    isLoading: arcadeLoading,
    refetch: refetchArcadeConnections,
    revokeAuthorization,
  } = useArcadeConnections();
  const { refetch } = useSession();
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  const trpc = useTRPC();
  const { mutateAsync: deleteConnection } = useMutation(trpc.connections.delete.mutationOptions());
  const { mutateAsync: createArcadeConnection } = useMutation(
    trpc.arcadeConnections.createConnection.mutationOptions(),
  );
  const [{ refetch: refetchThreads }] = useThreads();
  const { isPro } = useBilling();
  const [, setPricingDialog] = useQueryState('pricingDialog');
  const [arcadeAuthSuccess] = useQueryState('arcade_auth_success');
  const [toolkit] = useQueryState('toolkit');
  const [authId] = useQueryState('auth_id');
  const [error] = useQueryState('error');

  useEffect(() => {
    if (arcadeAuthSuccess === 'true' && toolkit && authId) {
      createArcadeConnection({ toolkit, authId })
        .then(() => {
          toast.success(`Successfully connected ${toolkit}`);
          void refetchArcadeConnections();
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((err) => {
          console.error('Failed to create Arcade connection:', err);
          toast.error(`Failed to connect ${toolkit}`);
        });
    } else if (error) {
      let errorMessage = 'Authentication failed';
      if (error === 'arcade_auth_failed') {
        errorMessage = 'Arcade authorization failed';
      } else if (error === 'arcade_auth_incomplete') {
        errorMessage = 'Authorization was not completed';
      } else if (error === 'arcade_verification_failed') {
        errorMessage = 'User verification failed';
      } else if (error === 'arcade_auth_error') {
        errorMessage = 'An error occurred during authentication';
      }
      toast.error(errorMessage);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [arcadeAuthSuccess, toolkit, authId, error, createArcadeConnection, refetchArcadeConnections]);
  const disconnectAccount = async (connectionId: string) => {
    await deleteConnection(
      { connectionId },
      {
        onError: (error) => {
          console.error('Error disconnecting account:', error);
          toast.error(m['pages.settings.connections.disconnectError']());
        },
      },
    );
    toast.success(m['pages.settings.connections.disconnectSuccess']());
    void refetchConnections();
    refetch();
    void refetchThreads();
  };

  return (
    <div className="grid gap-6">
      <SettingsCard title="Email Connections" description="Connect your email accounts to Zero.">
        <div className="space-y-6">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[...Array(3)].map((n) => (
                <div
                  key={n}
                  className="bg-popover flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-4 w-full lg:w-32" />
                      <Skeleton className="h-3 w-full lg:w-48" />
                    </div>
                  </div>
                  <Skeleton className="ml-4 h-8 w-8 rounded-full" />
                </div>
              ))}
            </div>
          ) : data?.connections?.length ? (
            <div className="lg: grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              {data.connections.map((connection) => {
                const Icon = emailProviders.find(
                  (p) => p.providerId === connection.providerId,
                )?.icon;
                return (
                  <div
                    key={connection.id}
                    className="bg-popover flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      {connection.picture ? (
                        <img
                          src={connection.picture}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          width={48}
                          height={48}
                        />
                      ) : (
                        <div className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                          {Icon && <Icon className="size-6" />}
                        </div>
                      )}
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-sm font-medium">{connection.name}</span>
                        <div className="text-muted-foreground flex items-center gap-2 text-xs">
                          <Tooltip
                            delayDuration={0}
                            open={openTooltip === connection.id}
                            onOpenChange={(open) => {
                              if (window.innerWidth <= 768) {
                                setOpenTooltip(open ? connection.id : null);
                              }
                            }}
                          >
                            <TooltipTrigger asChild>
                              <span
                                className="max-w-[180px] cursor-default truncate sm:max-w-[240px] md:max-w-[300px]"
                                onClick={() => {
                                  if (window.innerWidth <= 768) {
                                    setOpenTooltip(
                                      openTooltip === connection.id ? null : connection.id,
                                    );
                                  }
                                }}
                              >
                                {connection.email}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="start" className="select-all">
                              <div className="font-mono">{connection.email}</div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {data.disconnectedIds?.includes(connection.id) ? (
                        <>
                          <div>
                            <Badge variant="destructive">
                              {m['pages.settings.connections.disconnected']()}
                            </Badge>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              await authClient.linkSocial({
                                provider: connection.providerId,
                                callbackURL: `${window.location.origin}/settings/connections`,
                              });
                            }}
                          >
                            <Unplug className="size-4" />
                            {m['pages.settings.connections.reconnect']()}
                          </Button>
                        </>
                      ) : null}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-primary ml-4 shrink-0"
                            disabled={data.connections.length === 1}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent showOverlay>
                          <DialogHeader>
                            <DialogTitle>
                              {m['pages.settings.connections.disconnectTitle']()}
                            </DialogTitle>
                            <DialogDescription>
                              {m['pages.settings.connections.disconnectDescription']()}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="flex justify-end gap-4">
                            <DialogClose asChild>
                              <Button variant="outline">
                                {m['pages.settings.connections.cancel']()}
                              </Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button onClick={() => disconnectAccount(connection.id)}>
                                {m['pages.settings.connections.remove']()}
                              </Button>
                            </DialogClose>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="flex items-center justify-start">
            {isPro ? (
              <AddConnectionDialog>
                <Button
                  variant="outline"
                  className="group relative w-10 overflow-hidden duration-200 hover:w-full sm:hover:w-[32.5%]"
                >
                  <Plus className="absolute h-4 w-4 group-hover:hidden" />
                  <span className="whitespace-nowrap pl-7 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    {m['pages.settings.connections.addEmail']()}
                  </span>
                </Button>
              </AddConnectionDialog>
            ) : (
              <Button
                onClick={() => setPricingDialog('true')}
                variant="outline"
                className="group relative w-10 overflow-hidden duration-200 hover:w-full sm:hover:w-[32.5%]"
              >
                <Plus className="absolute h-4 w-4 group-hover:hidden" />
                <span className="whitespace-nowrap pl-7 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {m['pages.settings.connections.addEmail']()}
                </span>
              </Button>
            )}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Arcade Integrations"
        description="Connect to external services through Arcade to enhance Zero Mail with AI-powered tools."
      >
        <div className="space-y-6">
          {arcadeLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[...Array(3)].map((n) => (
                <div
                  key={n}
                  className="bg-popover flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-4 w-full lg:w-32" />
                      <Skeleton className="h-3 w-full lg:w-48" />
                    </div>
                  </div>
                  <Skeleton className="ml-4 h-8 w-8 rounded-full" />
                </div>
              ))}
            </div>
          ) : arcadeConnections.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              {arcadeConnections.map((connection) => {
                const Icon = toolkitIcons[connection.provider_id?.split('-')[0] || ''];
                return (
                  <div
                    key={connection.id}
                    className="bg-popover flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex min-w-0 flex-row gap-4">
                        <div className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="truncate text-sm font-medium capitalize">
                            {connection.provider_id?.split('-')[0]}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="bg-green-500 text-xs">
                              Connected
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-4 shrink-0 text-red-500 hover:text-red-600"
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent showOverlay>
                        <DialogHeader>
                          <DialogTitle>
                            Disconnect {connection.provider_id?.split('-')[0]}
                          </DialogTitle>
                          <DialogDescription>
                            Are you sure you want to disconnect this integration?
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end gap-4">
                          <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <DialogClose asChild>
                            <Button
                              onClick={async () => {
                                try {
                                  await revokeAuthorization({
                                    connectionId: connection.connection_id!,
                                  });
                                  toast.success('Integration disconnected');
                                  void refetchArcadeConnections();
                                } catch {
                                  toast.error('Failed to disconnect integration');
                                }
                              }}
                            >
                              Disconnect
                            </Button>
                          </DialogClose>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground py-8 text-center">
              <Sparkles className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p className="text-sm">No integrations connected</p>
              <p className="mt-1 text-xs">
                Connect to external services to access powerful AI tools
              </p>
            </div>
          )}

          <div className="flex items-center justify-start">
            <AddArcadeConnectionDialog onSuccess={() => void refetchArcadeConnections()}>
              <Button
                variant="outline"
                className="group relative w-10 overflow-hidden duration-200 hover:w-full sm:hover:w-[32.5%]"
              >
                <Plus className="absolute h-4 w-4 group-hover:hidden" />
                <span className="whitespace-nowrap pl-7 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  Add Integration
                </span>
              </Button>
            </AddArcadeConnectionDialog>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
