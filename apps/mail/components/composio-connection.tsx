import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { toast } from "sonner";
import { useTRPC } from "@/providers/query-provider";

interface ComposioConnectionProps {
    authConfigId: string;
    serviceName: string;
    description?: string;
}

export function ComposioConnection({
    authConfigId,
    serviceName,
    description
}: ComposioConnectionProps) {
    const [isConnecting, setIsConnecting] = useState(false);
    const trpc = useTRPC();

    const { mutateAsync: initiateConnection } = useMutation(trpc.composio.initiateConnection.mutationOptions());
    const { mutateAsync: completeConnection } = useMutation(trpc.composio.completeConnection.mutationOptions());

    const handleConnect = async () => {
        setIsConnecting(true);

        try {
            // First initiate the connection
            const initiateResult = await initiateConnection({ authConfigId });
            if (initiateResult.redirectUrl) {
                window.open(initiateResult.redirectUrl, '_blank', 'width=600,height=700');
            }
            toast.success("Connection initiated. Please complete the authorization in the new window.");

            // Then complete the connection (this will wait for user authorization)
            await completeConnection({ authConfigId });
            toast.success(`Successfully connected to ${serviceName}`);
        } catch (error: any) {
            console.error('Connection error:', error);
            toast.error(error?.message || "Connection failed");
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>{serviceName}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <Button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="w-full"
                >
                    {isConnecting ? "Connecting..." : `Connect to ${serviceName}`}
                </Button>
            </CardContent>
        </Card>
    );
}

// Example usage component
export function ComposioConnectionsExample() {
    return (
        <div className="space-y-4 p-4">
            <h2 className="text-2xl font-bold">Connect External Services</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <ComposioConnection
                    authConfigId="github"
                    serviceName="GitHub"
                    description="Connect your GitHub account to manage repositories and issues"
                />
                <ComposioConnection
                    authConfigId="notion"
                    serviceName="Notion"
                    description="Connect your Notion workspace to sync notes and documents"
                />
                <ComposioConnection
                    authConfigId="slack"
                    serviceName="Slack"
                    description="Connect your Slack workspace for team communication"
                />
            </div>
        </div>
    );
}
