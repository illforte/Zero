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
import {
    Bot,
    Mail,
    Settings,
    TestTube,
    Zap,
    CheckCircle,
    XCircle,
    Loader2,
    ExternalLink,
    Play,
    StopCircle,
    Github,
    GitBranch
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ComposioPage() {
    console.log("🎯 ComposioPage component is rendering");

    const [isConnecting, setIsConnecting] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isCreatingTrigger, setIsCreatingTrigger] = useState(false);
    const [isCreatingGitHubIssue, setIsCreatingGitHubIssue] = useState(false);
    const [isCreatingLinearIssue, setIsCreatingLinearIssue] = useState(false);
    const [emailData, setEmailData] = useState({
        to: "",
        subject: "",
        body: ""
    });
    const [githubData, setGitHubData] = useState({
        title: "",
        body: "",
        repository: ""
    });
    const [linearData, setLinearData] = useState({
        title: "",
        description: "",
        teamId: ""
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
    const { mutateAsync: createGitHubIssue } = useMutation(trpc.composio.createGitHubIssue.mutationOptions());
    const { mutateAsync: createLinearIssue } = useMutation(trpc.composio.createLinearIssue.mutationOptions());

    const handleConnect = async () => {
        setIsConnecting(true);
        try {
            const initiateResult = await initiateConnection({ authConfigId: "ac_rcLucYNgqmzt" });

            if (initiateResult.redirectUrl) {
                // Need to complete the OAuth flow
                window.open(initiateResult.redirectUrl, '_blank', 'width=600,height=700');
                toast.success("Connection initiated. Please complete the authorization in the new window.");

                const completeResult = await completeConnection({ authConfigId: "ac_rcLucYNgqmzt" });
                toast.success("Connection successful! Successfully connected to Gmail");
                setConnectionStatus({
                    connected: true,
                    accountId: completeResult.connectedAccount?.id
                });
            }
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

    const handleCreateGitHubIssue = async () => {
        if (!githubData.title || !githubData.body || !githubData.repository) {
            toast.error("Missing GitHub issue data. Please fill in all fields");
            return;
        }

        setIsCreatingGitHubIssue(true);
        try {
            await createGitHubIssue({
                title: githubData.title,
                body: githubData.body,
                repository: githubData.repository
            });
            toast.success("GitHub issue created successfully!");
        } catch (error: any) {
            console.error('GitHub issue creation error:', error);
            toast.error(error?.message || "GitHub issue creation failed");
        } finally {
            setIsCreatingGitHubIssue(false);
        }
    };

    const handleCreateLinearIssue = async () => {
        if (!linearData.title || !linearData.description || !linearData.teamId) {
            toast.error("Missing Linear issue data. Please fill in all fields");
            return;
        }

        setIsCreatingLinearIssue(true);
        try {
            await createLinearIssue({
                title: linearData.title,
                description: linearData.description,
                teamId: linearData.teamId
            });
            toast.success("Linear issue created successfully!");
        } catch (error: any) {
            console.error('Linear issue creation error:', error);
            toast.error(error?.message || "Linear issue creation failed");
        } finally {
            setIsCreatingLinearIssue(false);
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
                <Bot className="h-6 w-6" />
                <h1 className="text-2xl font-bold">Composio AI Integration</h1>
                <Badge variant="secondary" className="ml-2">
                    <TestTube className="h-3 w-3 mr-1" />
                    Testing
                </Badge>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Gmail Connection
                    </CardTitle>
                    <CardDescription>
                        Connect your Gmail account to enable AI-powered email features
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label>Connection Status</Label>
                            <div className="flex items-center gap-2">
                                {connectionStatus.connected ? (
                                    <>
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        <span className="text-sm text-green-600">Connected</span>
                                        {connectionStatus.accountId && (
                                            <Badge variant="outline" className="text-xs">
                                                ID: {connectionStatus.accountId}
                                            </Badge>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-4 w-4 text-red-500" />
                                        <span className="text-sm text-red-600">Disconnected</span>
                                    </>
                                )}
                            </div>
                            {connectionStatus.error && (
                                <Alert className="mt-2">
                                    <AlertDescription className="text-red-600">
                                        Error: {connectionStatus.error}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                        <Button
                            onClick={handleConnect}
                            disabled={isConnecting}
                            className="flex items-center gap-2"
                        >
                            {isConnecting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <Zap className="h-4 w-4" />
                                    Connect Gmail
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        AI Email Composer
                    </CardTitle>
                    <CardDescription>
                        Send AI-powered emails using Composio integration
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
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
                                placeholder="Describe what you want to send..."
                                value={emailData.body}
                                onChange={(e) => setEmailData(prev => ({ ...prev, body: e.target.value }))}
                                rows={4}
                            />
                        </div>
                    </div>
                    <Button
                        onClick={handleSendEmail}
                        disabled={isSendingEmail}
                        className="flex items-center gap-2"
                    >
                        {isSendingEmail ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Play className="h-4 w-4" />
                                Send AI Email
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Gmail Triggers
                    </CardTitle>
                    <CardDescription>
                        Create triggers to automatically process new Gmail messages
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={handleCreateTrigger}
                        disabled={isCreatingTrigger || !connectionStatus.connected}
                        className="flex items-center gap-2"
                    >
                        {isCreatingTrigger ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <StopCircle className="h-4 w-4" />
                                Create Gmail Trigger
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Github className="h-5 w-5" />
                        GitHub Integration
                    </CardTitle>
                    <CardDescription>
                        Create GitHub issues using AI-powered descriptions
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <Label htmlFor="github-title">Issue Title</Label>
                            <Input
                                id="github-title"
                                placeholder="Bug: Login page not working"
                                value={githubData.title}
                                onChange={(e) => setGitHubData(prev => ({ ...prev, title: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label htmlFor="github-body">Issue Description</Label>
                            <Textarea
                                id="github-body"
                                placeholder="Describe the issue or feature request..."
                                value={githubData.body}
                                onChange={(e) => setGitHubData(prev => ({ ...prev, body: e.target.value }))}
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label htmlFor="github-repo">Repository</Label>
                            <Input
                                id="github-repo"
                                placeholder="owner/repository-name"
                                value={githubData.repository}
                                onChange={(e) => setGitHubData(prev => ({ ...prev, repository: e.target.value }))}
                            />
                        </div>
                    </div>
                    <Button
                        onClick={handleCreateGitHubIssue}
                        disabled={isCreatingGitHubIssue}
                        className="flex items-center gap-2"
                    >
                        {isCreatingGitHubIssue ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Github className="h-4 w-4" />
                                Create GitHub Issue
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <GitBranch className="h-5 w-5" />
                        Linear Integration
                    </CardTitle>
                    <CardDescription>
                        Create Linear issues using AI-powered descriptions
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <Label htmlFor="linear-title">Issue Title</Label>
                            <Input
                                id="linear-title"
                                placeholder="Bug: Login page not working"
                                value={linearData.title}
                                onChange={(e) => setLinearData(prev => ({ ...prev, title: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label htmlFor="linear-description">Issue Description</Label>
                            <Textarea
                                id="linear-description"
                                placeholder="Describe the issue or feature request..."
                                value={linearData.description}
                                onChange={(e) => setLinearData(prev => ({ ...prev, description: e.target.value }))}
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label htmlFor="linear-team">Team ID</Label>
                            <Input
                                id="linear-team"
                                placeholder="team-id"
                                value={linearData.teamId}
                                onChange={(e) => setLinearData(prev => ({ ...prev, teamId: e.target.value }))}
                            />
                        </div>
                    </div>
                    <Button
                        onClick={handleCreateLinearIssue}
                        disabled={isCreatingLinearIssue}
                        className="flex items-center gap-2"
                    >
                        {isCreatingLinearIssue ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <GitBranch className="h-4 w-4" />
                                Create Linear Issue
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TestTube className="h-5 w-5" />
                        Debug Information
                    </CardTitle>
                    <CardDescription>
                        Technical details for debugging and development
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 text-sm">
                        <div>
                            <strong>Connection Status:</strong> {connectionStatus.connected ? 'Connected' : 'Disconnected'}
                        </div>
                        {connectionStatus.accountId && (
                            <div>
                                <strong>Account ID:</strong> {connectionStatus.accountId}
                            </div>
                        )}
                        {connectionStatus.error && (
                            <div>
                                <strong>Error:</strong> {connectionStatus.error}
                            </div>
                        )}
                        <div>
                            <strong>TRPC Status:</strong> {trpc ? 'Available' : 'Not Available'}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

