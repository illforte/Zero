import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Loader2, CheckCircle2, Sparkles, ArrowLeft, ChevronRight } from 'lucide-react';
import { useComposioConnections } from '@/hooks/use-composio-connection';
import { useArcadeConnections } from '@/hooks/use-arcade-connection';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { GitHub, Linear } from '../icons/icons';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';

const Stripe = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.831 3.47 1.426 3.47 2.338 0 .914-.796 1.431-2.126 1.431-1.72 0-4.516-.924-6.378-2.168l-.9 5.555C7.986 22.18 10.194 23 13.714 23c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.467-3.235 2.467-5.732 0-4.128-2.524-5.851-6.594-7.305h-.039z" />
  </svg>
);

export const toolkitIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  github: GitHub,
  stripe: Stripe,
  linear: Linear,
};

type IntegrationProvider = 'arcade' | 'composio';
type Step = 'select-provider' | 'select-toolkit' | 'connecting';

interface Toolkit {
  name: string;
  description: string;
  toolCount: number;
}

export const AddIntegrationDialog = ({
  children,
  onSuccess,
}: {
  children?: React.ReactNode;
  onSuccess?: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>('select-provider');
  const [selectedProvider, setSelectedProvider] = useState<IntegrationProvider | null>(null);
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);

  const {
    toolkits: arcadeToolkits,
    connections: arcadeConnections,
    isLoading: arcadeLoading,
    authorizeToolkit: authorizeArcade,
  } = useArcadeConnections();

  const {
    toolkits: composioToolkits,
    connections: composioConnections,
    isLoading: composioLoading,
    authorizeToolkit: authorizeComposio,
  } = useComposioConnections();

  const trpc = useTRPC();
  const { mutateAsync: createArcadeConnection } = useMutation(
    trpc.arcadeConnections.createConnection.mutationOptions(),
  );
  const { mutateAsync: createComposioConnection } = useMutation(
    trpc.composioConnections.createConnection.mutationOptions(),
  );

  const handleProviderSelect = (provider: IntegrationProvider) => {
    setSelectedProvider(provider);
    setCurrentStep('select-toolkit');
  };

  const handleBack = () => {
    if (currentStep === 'select-toolkit') {
      setCurrentStep('select-provider');
      setSelectedProvider(null);
    }
  };

  const handleConnect = async (toolkit: string) => {
    if (!selectedProvider) return;

    setConnectingToolkit(toolkit);
    setCurrentStep('connecting');

    try {
      const isArcade = selectedProvider === 'arcade';
      const authorizeFunc = isArcade ? authorizeArcade : authorizeComposio;
      const createFunc = isArcade ? createArcadeConnection : createComposioConnection;

      const authResult = await authorizeFunc(toolkit.toLowerCase());

      console.log(`[${selectedProvider.toUpperCase()} AUTH RESULT]`, authResult);

      if (authResult?.authUrl && authResult?.authId) {
        const authWindow = window.open(authResult.authUrl, '_blank', 'width=600,height=600');

        const checkInterval = setInterval(async () => {
          if (authWindow?.closed) {
            clearInterval(checkInterval);

            try {
              await createFunc({
                toolkit,
                authId: authResult.authId,
              });

              toast.success(`Successfully connected ${toolkit}`);
              setConnectingToolkit(null);
              setCurrentStep('select-provider');
              setSelectedProvider(null);
              setIsOpen(false);
              onSuccess?.();
            } catch {
              console.log('Authorization not complete or failed');
              setConnectingToolkit(null);
              setCurrentStep('select-toolkit');
            }
          }
        }, 1000);

        setTimeout(
          () => {
            clearInterval(checkInterval);
            setConnectingToolkit(null);
            setCurrentStep('select-toolkit');
          },
          5 * 60 * 1000,
        );
      }
    } catch (error) {
      console.error('Failed to connect toolkit:', error);
      toast.error(`Failed to connect ${toolkit}`);
      setConnectingToolkit(null);
      setCurrentStep('select-toolkit');
    }
  };

  const isConnected = (toolkit: string) => {
    if (selectedProvider === 'arcade') {
      return arcadeConnections.some((c) => c.providerId?.split('-')[0] === toolkit.toLowerCase());
    } else {
      return composioConnections.some((c) => c.providerId?.split('-')[0] === toolkit.toLowerCase());
    }
  };

  const getCurrentToolkits = (): Toolkit[] => {
    if (!selectedProvider) return [];
    return selectedProvider === 'arcade' ? arcadeToolkits : composioToolkits;
  };

  const isLoading = selectedProvider === 'arcade' ? arcadeLoading : composioLoading;

  const resetDialog = () => {
    setCurrentStep('select-provider');
    setSelectedProvider(null);
    setConnectingToolkit(null);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetDialog();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent showOverlay={true} className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {currentStep !== 'select-provider' && currentStep !== 'connecting' && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <DialogTitle>
                {currentStep === 'select-provider' && 'Add Integration'}
                {currentStep === 'select-toolkit' &&
                  `${selectedProvider === 'arcade' ? 'Arcade' : 'Composio'} Integrations`}
                {currentStep === 'connecting' && 'Connecting...'}
              </DialogTitle>
              <DialogDescription>
                {currentStep === 'select-provider' &&
                  'Choose an integration provider to connect external services'}
                {currentStep === 'select-toolkit' && 'Select a service to connect to Zero Mail'}
                {currentStep === 'connecting' && `Authorizing ${connectingToolkit} connection`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4">
          {currentStep === 'select-provider' && (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              <button
                onClick={() => handleProviderSelect('arcade')}
                className={cn(
                  'hover:border-primary/50 hover:bg-accent group relative flex flex-col items-center justify-center rounded-lg border p-6 transition-all',
                  'focus:ring-primary focus:outline-none focus:ring-2 focus:ring-offset-2',
                )}
              >
                <div className="bg-primary/10 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">Arcade</h3>
                <p className="text-muted-foreground text-center text-sm">
                  Connect to external services through Arcade's AI-powered integrations
                </p>
                <ChevronRight className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>

              <button
                onClick={() => handleProviderSelect('composio')}
                className={cn(
                  'hover:border-primary/50 hover:bg-accent group relative flex flex-col items-center justify-center rounded-lg border p-6 transition-all',
                  'focus:ring-primary focus:outline-none focus:ring-2 focus:ring-offset-2',
                )}
              >
                <div className="bg-primary/10 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">Composio</h3>
                <p className="text-muted-foreground text-center text-sm">
                  Access GitHub, Stripe, and Linear through Composio's comprehensive toolkit
                </p>
                <ChevronRight className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </div>
          )}

          {currentStep === 'select-toolkit' && (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : getCurrentToolkits().length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  <Sparkles className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p className="text-sm">No integrations available</p>
                  <p className="mt-1 text-xs">
                    Please check your {selectedProvider === 'arcade' ? 'Arcade' : 'Composio'} API
                    key configuration
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {getCurrentToolkits().map((toolkit) => {
                    const Icon = toolkitIcons[toolkit.name.toLowerCase()] || Sparkles;
                    const connected = isConnected(toolkit.name);

                    return (
                      <div
                        key={toolkit.name}
                        className={`relative rounded-lg border p-4 transition-colors ${
                          connected
                            ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                            : 'hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium capitalize">{toolkit.name}</h3>
                            <p className="text-muted-foreground mt-1 text-sm">
                              {toolkit.description}
                            </p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              {toolkit.toolCount} tools available
                            </p>
                          </div>
                          {connected ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConnect(toolkit.name)}
                              disabled={connectingToolkit === toolkit.name}
                              className="shrink-0"
                            >
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {currentStep === 'connecting' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="mb-4 h-12 w-12 animate-spin" />
              <p className="text-muted-foreground text-center">
                Please complete the authorization in the popup window
              </p>
              <p className="text-muted-foreground mt-2 text-center text-sm">
                This window will close automatically once authorization is complete
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
