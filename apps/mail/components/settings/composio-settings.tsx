import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTRPC } from "@/providers/query-provider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ComposioSettingsPage() {
    console.log("🎯 ComposioSettingsPage component is rendering");

    const [isConnecting, setIsConnecting] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isCreatingTrigger, setIsCreatingTrigger] = useState(false);
    const [emailData, setEmailData] = useState({
        to: "",
        subject: "",
        body: ""
    });
    const [connectionStatus, setConnectionStatus] = useState<{
        connected: boolean;
        accountId?: string;
        error?: string;
    }>({ connected: false });

    const trpc = useTRPC();

    // TRPC mutations
    const { mutateAsync: initiateConnection } = useMutation(trpc.composio.initiateConnection.mutationOptions());
    const { mutateAsync: completeConnection } = useMutation(trpc.composio.completeConnection.mutationOptions());
    const { mutateAsync: sendEmail } = useMutation(trpc.composio.sendEmail.mutationOptions());
    const { mutateAsync: createTrigger } = useMutation(trpc.composio.createGmailTrigger.mutationOptions());

    const handleConnect = async () => {
        setIsConnecting(true);
        try {
            const initiateResult = await initiateConnection({ authConfigId: "ac_rcLucYNgqmzt" });
            if (initiateResult.redirectUrl) {
                window.open(initiateResult.redirectUrl, '_blank', 'width=600,height=700');
            }
            toast.success("Connection initiated. Please complete the authorization in the new window.");

            const completeResult = await completeConnection({ authConfigId: "ac_rcLucYNgqmzt" });
            toast.success("Connection successful! Successfully connected to Gmail");
            setConnectionStatus({
                connected: true,
                accountId: completeResult.connectedAccount?.id
            });
        } catch (error: any) {
            console.error('Connection error:', error);
            toast.error(error?.message || "Connection failed");
            setConnectionStatus({
                connected: false,
                error: error?.message
            });
        } finally {
            setIsConnecting(false);
        }
    };

    const handleSendEmail = async () => {
        if (!emailData.to || !emailData.subject || !emailData.body) {
            toast.error("Missing email data. Please fill in all email fields");
            return;
        }

        setIsSendingEmail(true);
        try {
            await sendEmail({
                to: emailData.to,
                subject: emailData.subject,
                body: emailData.body
            });
            toast.success("Email sent successfully! Email was sent using Composio and AI");
        } catch (error: any) {
            console.error('Email sending error:', error);
            toast.error(error?.message || "Email sending failed");
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleCreateTrigger = async () => {
        if (!connectionStatus.accountId) {
            toast.error("No connection. Please connect to Gmail first");
            return;
        }

        setIsCreatingTrigger(true);
        try {
            const result = await createTrigger({
                connectedAccountId: connectionStatus.accountId
            });
            toast.success(`Trigger created successfully! Gmail trigger created with ID: ${result.trigger?.triggerId}`);
        } catch (error: any) {
            console.error('Trigger creation error:', error);
            toast.error(error?.message || "Trigger creation failed");
        } finally {
            setIsCreatingTrigger(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">Composio AI Integration</h1>
                <Badge variant="secondary" className="ml-2">

                    Testing
                </Badge>
            </div>

            <Alert>
                <AlertDescription>
                    This page allows you to test Composio AI integration features including Gmail connections,
                    AI-powered email sending, and trigger management.
                </AlertDescription>
            </Alert>

            {/* Connection Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">

                        Connection Status
                    </CardTitle>
                    <CardDescription>
                        Connect your Gmail account to enable AI-powered email features
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        {connectionStatus.connected ? (
                            <>

                                <span className="text-green-600 font-medium">Connected to Gmail</span>
                                <Badge variant="outline">{connectionStatus.accountId}</Badge>
                            </>
                        ) : (
                            <>

                                <span className="text-red-600 font-medium">Not connected</span>
                            </>
                        )}
                    </div>

                    {connectionStatus.error && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                            Error: {connectionStatus.error}
                        </div>
                    )}

                    <Button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="w-full"
                    >
                        {isConnecting ? (
                            <>

                                Connecting...
                            </>
                        ) : (
                            <>

                                Connect Gmail Account
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Separator />

            {/* Email Testing */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">

                        AI Email Testing
                    </CardTitle>
                    <CardDescription>
                        Test sending emails using AI and Composio integration
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4">
                        <div>
                            <Label htmlFor="email-to">To</Label>
                            <Input
                                id="email-to"
                                placeholder="recipient@example.com"
                                value={emailData.to}
                                onChange={(e) => setEmailData(prev => ({ ...prev, to: e.target.value }))}
                            />
                        </div>

                        <div>
                            <Label htmlFor="email-subject">Subject</Label>
                            <Input
                                id="email-subject"
                                placeholder="Email subject"
                                value={emailData.subject}
                                onChange={(e) => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                            />
                        </div>

                        <div>
                            <Label htmlFor="email-body">Body</Label>
                            <Textarea
                                id="email-body"
                                placeholder="Email body content"
                                rows={4}
                                value={emailData.body}
                                onChange={(e) => setEmailData(prev => ({ ...prev, body: e.target.value }))}
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleSendEmail}
                        disabled={isSendingEmail || !connectionStatus.connected}
                        className="w-full"
                    >
                        {isSendingEmail ? (
                            <>

                                Sending Email...
                            </>
                        ) : (
                            <>

                                Send Email with AI
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Separator />

            {/* Trigger Management */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">

                        Gmail Trigger Management
                    </CardTitle>
                    <CardDescription>
                        Create triggers to monitor new Gmail messages
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        This will create a trigger that monitors your Gmail inbox for new messages.
                    </div>

                    <Button
                        onClick={handleCreateTrigger}
                        disabled={isCreatingTrigger || !connectionStatus.connected}
                        className="w-full"
                    >
                        {isCreatingTrigger ? (
                            <>

                                Creating Trigger...
                            </>
                        ) : (
                            <>

                                Create Gmail Trigger
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Logs Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">

                        Debug Information
                    </CardTitle>
                    <CardDescription>
                        View connection and operation logs
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-sm space-y-2">
                        <div>
                            <strong>Connection Status:</strong> {connectionStatus.connected ? "Connected" : "Disconnected"}
                        </div>
                        {connectionStatus.accountId && (
                            <div>
                                <strong>Account ID:</strong> {connectionStatus.accountId}
                            </div>
                        )}
                        <div>
                            <strong>Environment:</strong> {import.meta.env.MODE}
                        </div>
                        <div>
                            <strong>Last Updated:</strong> {new Date().toLocaleString()}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

