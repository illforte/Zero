import { Composio } from "@composio/core";
import { OpenAI } from "openai";
import { env } from "../env";

console.log("🚀 Initializing Composio integration...");
console.log("📋 Environment check:", {
    hasOpenAIKey: !!env.OPENAI_API_KEY,
    hasComposioKey: !!env.COMPOSIO_API_KEY,
    nodeEnv: env.NODE_ENV,
});

// Initialize OpenAI client
console.log("🤖 Initializing OpenAI client...");
const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
});
console.log("✅ OpenAI client initialized successfully");

// Initialize Composio client
console.log("🔗 Initializing Composio client...");
const composio = new Composio({
    apiKey: env.COMPOSIO_API_KEY,
});
console.log("✅ Composio client initialized successfully");
console.log("🎉 Composio integration ready!");

/**
 * Check for existing Composio connections for a user
 * @param userId - The user's email address
 * @param authConfigId - The auth configuration ID for the service to connect
 * @returns Existing connections or null
 */
export async function getExistingComposioConnections(userId: string, authConfigId: string) {
    console.log("🔍 Checking for existing Composio connections...", {
        userId,
        authConfigId,
        timestamp: new Date().toISOString(),
    });

    try {
        console.log("📡 Calling Composio connectedAccounts.list...");
        const connections = await composio.connectedAccounts.list({
            userIds: [userId],
            authConfigIds: [authConfigId],
        });

        console.log("✅ Existing connections found", {
            connectionsCount: connections?.items?.length || 0,
            connections: connections?.items?.map((conn: any) => ({
                id: conn.id,
                status: conn.status,
                createdAt: conn.createdAt,
                authConfigId: conn.authConfig?.id,
            })),
            timestamp: new Date().toISOString(),
        });

        // Filter for active connections only
        const activeConnections = connections?.items?.filter((conn: any) =>
            conn.status === 'ACTIVE' && conn.authConfig?.id === authConfigId
        ) || [];

        console.log("✅ Active connections for this auth config:", {
            activeConnectionsCount: activeConnections.length,
            activeConnections: activeConnections.map((conn: any) => ({
                id: conn.id,
                status: conn.status,
                authConfigId: conn.authConfig?.id,
            })),
        });

        return activeConnections;
    } catch (error) {
        console.error('❌ Failed to get existing connections:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            userId,
            authConfigId,
            timestamp: new Date().toISOString(),
        });
        return [];
    }
}

/**
 * Initialize a Composio connection for a user
 * @param userId - The user's email address
 * @param authConfigId - The auth configuration ID for the service to connect
 * @returns Connection request with redirect URL
 */
export async function initiateComposioConnection(userId: string, authConfigId: string) {
    console.log("🔄 Initiating Composio connection...", {
        userId,
        authConfigId,
        timestamp: new Date().toISOString(),
    });

    try {
        // First check for existing connections
        const existingConnections = await getExistingComposioConnections(userId, authConfigId);

        if (existingConnections && existingConnections.length > 0) {
            console.log("✅ Found existing connections, returning first one", {
                existingConnectionsCount: existingConnections.length,
                firstConnectionId: existingConnections[0].id,
            });

            return {
                success: true,
                redirectUrl: null, // No redirect needed since we have existing connection
                connectionRequest: null,
                existingConnection: existingConnections[0],
            };
        }

        console.log("📡 No existing connections found, initiating new connection...");
        const connectionRequest = await composio.connectedAccounts.initiate(
            userId,
            authConfigId,
            {
                allowMultiple: true, // Allow multiple connections to avoid the error
            }
        );

        console.log("✅ Connection request initiated successfully", {
            hasRedirectUrl: !!connectionRequest.redirectUrl,
            redirectUrl: connectionRequest.redirectUrl,
            requestId: connectionRequest.id || 'unknown',
        });

        return {
            success: true,
            redirectUrl: connectionRequest.redirectUrl,
            connectionRequest,
        };
    } catch (error) {
        console.error('❌ Failed to initiate Composio connection:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            userId,
            authConfigId,
            timestamp: new Date().toISOString(),
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Wait for a Composio connection to be established
 * @param connectionRequest - The connection request from initiateComposioConnection
 * @returns Connected account information
 */
export async function waitForComposioConnection(connectionRequest: any) {
    console.log("⏳ Waiting for Composio connection to be established...", {
        hasConnectionRequest: !!connectionRequest,
        requestId: connectionRequest?.id || 'unknown',
        timestamp: new Date().toISOString(),
    });

    try {
        console.log("🔄 Calling connectionRequest.waitForConnection()...");
        const connectedAccount = await connectionRequest.waitForConnection();

        console.log("🎉 Connection established successfully!", {
            connectedAccountId: connectedAccount.id,
            accountDetails: {
                id: connectedAccount.id,
                provider: connectedAccount.provider,
                status: connectedAccount.status,
                createdAt: connectedAccount.createdAt,
            },
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            connectedAccount,
        };
    } catch (error) {
        console.error('❌ Failed to wait for Composio connection:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            requestId: connectionRequest?.id || 'unknown',
            timestamp: new Date().toISOString(),
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Complete Composio connection flow for a user
 * @param userId - The user's email address
 * @param authConfigId - The auth configuration ID
 * @returns Complete connection flow result
 */
export async function completeComposioConnection(userId: string, authConfigId: string) {
    console.log("🚀 Starting complete Composio connection flow...", {
        userId,
        authConfigId,
        timestamp: new Date().toISOString(),
    });

    console.log("📡 Step 1: Initiating connection...");
    const initiateResult = await initiateComposioConnection(userId, authConfigId);

    if (!initiateResult.success) {
        console.log("❌ Connection initiation failed, aborting flow", {
            error: initiateResult.error,
            userId,
            authConfigId,
        });
        return initiateResult;
    }

    console.log("✅ Step 1 completed: Connection initiated successfully");
    console.log("🔗 Authorization URL:", initiateResult.redirectUrl);
    console.log("📋 Please authorize the app by visiting this URL:", initiateResult.redirectUrl);

    console.log("⏳ Step 2: Waiting for connection to be established...");
    const waitResult = await waitForComposioConnection(initiateResult.connectionRequest);

    console.log("🏁 Complete connection flow finished", {
        success: waitResult.success,
        hasConnectedAccount: !!waitResult.connectedAccount,
        connectedAccountId: waitResult.connectedAccount?.id,
        error: waitResult.error,
        userId,
        authConfigId,
        timestamp: new Date().toISOString(),
    });

    return {
        success: waitResult.success,
        redirectUrl: initiateResult.redirectUrl,
        connectedAccount: waitResult.success ? waitResult.connectedAccount : null,
        error: waitResult.error,
    };
}

/**
 * Send an email using Composio and OpenAI
 * @param userId - The user's email address
 * @param to - Recipient email
 * @param subject - Email subject
 * @param body - Email body
 * @returns Email sending result
 */
export async function sendEmailWithComposio(
    userId: string,
    to: string,
    subject: string,
    body: string
) {
    console.log("📧 Starting email sending process with Composio...", {
        userId,
        to,
        subject,
        bodyLength: body.length,
        timestamp: new Date().toISOString(),
    });

    try {
        console.log("🔧 Step 1: Getting connected account for user...");
        // Get the connected account for this user
        const existingConnections = await getExistingComposioConnections(userId, "ac_rcLucYNgqmzt");

        if (!existingConnections || existingConnections.length === 0) {
            throw new Error("No active Gmail connection found. Please connect your Gmail account first.");
        }

        const connectedAccountId = existingConnections[0].id;
        console.log("✅ Found connected account", {
            connectedAccountId,
            accountStatus: existingConnections[0].status,
        });

        console.log("🔧 Step 2: Fetching Gmail tools for user...");
        // Fetch tools for your user and execute
        const toolsForResponses = await composio.tools.get(userId, {
            tools: ["GMAIL_SEND_EMAIL"],
        });
        console.log("✅ Gmail tools fetched successfully", {
            toolsCount: toolsForResponses?.length || 0,
            hasGmailSendEmail: toolsForResponses?.some((tool: any) => tool.function?.name === 'GMAIL_SEND_EMAIL'),
        });

        const task = `Send an email to ${to} with the subject '${subject}' and the body '${body}'`;
        console.log("📝 Generated task for AI:", task);

        // Define the messages for the assistant
        const messages: OpenAI.ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: "You are a helpful assistant that can help with tasks.",
            },
            { role: "user", content: task },
        ];
        console.log("💬 Prepared messages for OpenAI", {
            messageCount: messages.length,
            systemMessage: messages[0].content,
            userMessage: messages[1].content,
        });

        console.log("🤖 Step 2: Creating OpenAI chat completion...");
        // Create a chat completion
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            tools: toolsForResponses,
            tool_choice: "auto",
        });
        console.log("✅ OpenAI response received", {
            model: response.model,
            usage: response.usage,
            hasToolCalls: !!response.choices[0]?.message?.tool_calls,
            toolCallCount: response.choices[0]?.message?.tool_calls?.length || 0,
        });

        console.log("🔧 Step 3: Executing tool calls with Composio...");
        // Execute the tool calls
        const result = await composio.provider.handleToolCalls(userId, response);
        console.log("🎉 Email sent successfully!", {
            result,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            result,
        };
    } catch (error) {
        console.error('❌ Failed to send email with Composio:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            userId,
            to,
            subject,
            timestamp: new Date().toISOString(),
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Create a Gmail trigger for new messages
 * @param userId - The user's email address
 * @param connectedAccountId - The connected account ID
 * @returns Trigger creation result
 */
export async function createGmailTrigger(userId: string, connectedAccountId: string) {
    console.log("🔔 Creating Gmail trigger for new messages...", {
        userId,
        connectedAccountId,
        triggerType: "GMAIL_NEW_GMAIL_MESSAGE",
        timestamp: new Date().toISOString(),
    });

    try {
        console.log("📡 Calling Composio triggers.create...");
        const trigger = await composio.triggers.create(
            userId,
            "GMAIL_NEW_GMAIL_MESSAGE",
            {
                connectedAccountId,
                triggerConfig: {
                    labelIds: "INBOX",
                    userId: "me",
                    interval: 1,
                },
            }
        );

        console.log("✅ Gmail trigger created successfully!", {
            triggerId: trigger.triggerId,
            triggerDetails: {
                id: trigger.triggerId,
                type: "GMAIL_NEW_GMAIL_MESSAGE",
            },
            userId,
            connectedAccountId,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            trigger,
        };
    } catch (error) {
        console.error('❌ Failed to create Gmail trigger:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            userId,
            connectedAccountId,
            timestamp: new Date().toISOString(),
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Subscribe to trigger events
 * @param triggerId - The trigger ID to subscribe to
 * @param callback - Callback function to handle trigger events
 */
export function subscribeToTriggers(triggerId: string, callback: (data: any) => void) {
    console.log("🔔 Setting up trigger subscription...", {
        triggerId,
        hasCallback: !!callback,
        timestamp: new Date().toISOString(),
    });

    composio.triggers.subscribe(
        (data) => {
            console.log("⚡️ Trigger event received!", {
                triggerSlug: data.triggerSlug,
                triggerId: data.id,
                eventType: data.metadata?.triggerSlug,
                dataKeys: Object.keys(data),
                timestamp: new Date().toISOString(),
            });
            console.log("📊 Full trigger event data:", JSON.stringify(data, null, 2));

            try {
                callback(data);
                console.log("✅ Trigger callback executed successfully");
            } catch (callbackError) {
                console.error("❌ Error in trigger callback:", {
                    error: callbackError instanceof Error ? callbackError.message : 'Unknown error',
                    stack: callbackError instanceof Error ? callbackError.stack : undefined,
                    triggerId,
                    timestamp: new Date().toISOString(),
                });
            }
        },
        { triggerId }
    );

    console.log("✅ Trigger subscription set up successfully", {
        triggerId,
        timestamp: new Date().toISOString(),
    });
}

/**
 * Create a GitHub issue using Composio and AI
 * @param userId - The user's email address
 * @param title - Issue title
 * @param body - Issue description
 * @param repository - Repository name (e.g., "owner/repo")
 * @returns Issue creation result
 */
export async function createGitHubIssue(
    userId: string,
    title: string,
    body: string,
    repository: string
) {
    console.log("🐙 Creating GitHub issue with Composio...", {
        userId,
        title,
        bodyLength: body.length,
        repository,
        timestamp: new Date().toISOString(),
    });

    try {
        console.log("🔧 Step 1: Getting connected account for user...");
        // Get the connected account for this user
        const existingConnections = await getExistingComposioConnections(userId, "ac_github"); // GitHub auth config ID

        if (!existingConnections || existingConnections.length === 0) {
            throw new Error("No active GitHub connection found. Please connect your GitHub account first.");
        }

        const connectedAccountId = existingConnections[0].id;
        console.log("✅ Found connected account", {
            connectedAccountId,
            accountStatus: existingConnections[0].status,
        });

        console.log("🔧 Step 2: Fetching GitHub tools for user...");
        const toolsForResponses = await composio.tools.get(userId, {
            tools: ["GITHUB_CREATE_ISSUE"],
        });

        const task = `Create a GitHub issue in repository ${repository} with title '${title}' and description '${body}'`;
        console.log("📝 Generated task for AI:", task);

        const messages: OpenAI.ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: "You are a helpful assistant that can help with GitHub tasks.",
            },
            { role: "user", content: task },
        ];

        console.log("🤖 Step 3: Creating OpenAI chat completion...");
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            tools: toolsForResponses,
            tool_choice: "auto",
        });

        console.log("🔧 Step 4: Executing tool calls with Composio...");
        const result = await composio.provider.handleToolCalls(userId, response);
        console.log("🎉 GitHub issue created successfully!", {
            result,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            result,
        };
    } catch (error) {
        console.error('❌ Failed to create GitHub issue with Composio:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            userId,
            title,
            repository,
            timestamp: new Date().toISOString(),
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Create a Linear issue using Composio and AI
 * @param userId - The user's email address
 * @param title - Issue title
 * @param description - Issue description
 * @param teamId - Linear team ID
 * @returns Issue creation result
 */
export async function createLinearIssue(
    userId: string,
    title: string,
    description: string,
    teamId: string
) {
    console.log("📋 Creating Linear issue with Composio...", {
        userId,
        title,
        descriptionLength: description.length,
        teamId,
        timestamp: new Date().toISOString(),
    });

    try {
        console.log("🔧 Step 1: Getting connected account for user...");
        // Get the connected account for this user
        const existingConnections = await getExistingComposioConnections(userId, "ac_linear"); // Linear auth config ID

        if (!existingConnections || existingConnections.length === 0) {
            throw new Error("No active Linear connection found. Please connect your Linear account first.");
        }

        const connectedAccountId = existingConnections[0].id;
        console.log("✅ Found connected account", {
            connectedAccountId,
            accountStatus: existingConnections[0].status,
        });

        console.log("🔧 Step 2: Fetching Linear tools for user...");
        const toolsForResponses = await composio.tools.get(userId, {
            tools: ["LINEAR_CREATE_ISSUE"],
        });

        const task = `Create a Linear issue in team ${teamId} with title '${title}' and description '${description}'`;
        console.log("📝 Generated task for AI:", task);

        const messages: OpenAI.ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: "You are a helpful assistant that can help with Linear tasks.",
            },
            { role: "user", content: task },
        ];

        console.log("🤖 Step 3: Creating OpenAI chat completion...");
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            tools: toolsForResponses,
            tool_choice: "auto",
        });

        console.log("🔧 Step 4: Executing tool calls with Composio...");
        const result = await composio.provider.handleToolCalls(userId, response);
        console.log("🎉 Linear issue created successfully!", {
            result,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            result,
        };
    } catch (error) {
        console.error('❌ Failed to create Linear issue with Composio:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            userId,
            title,
            teamId,
            timestamp: new Date().toISOString(),
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

export { composio, openai };



// import { Composio } from "@composio/core";
// import { OpenAI } from "openai";
// import { env } from "../env";

// // Initialize OpenAI client
// const openai = new OpenAI({
//     apiKey: env.OPENAI_API_KEY,
// });

// // Initialize Composio client
// const composio = new Composio({
//     apiKey: env.COMPOSIO_API_KEY,
// });

// /**
//  * Initialize a Composio connection for a user
//  * @param userId - The user's email address
//  * @param authConfigId - The auth configuration ID for the service to connect
//  * @returns Connection request with redirect URL
//  */
// export async function initiateComposioConnection(userId: string, authConfigId: string) {
//     try {
//         const connectionRequest = await composio.connectedAccounts.initiate(
//             userId,
//             authConfigId
//         );

//         return {
//             success: true,
//             redirectUrl: connectionRequest.redirectUrl,
//             connectionRequest,
//         };
//     } catch (error) {
//         console.error('Failed to initiate Composio connection:', error);
//         return {
//             success: false,
//             error: error instanceof Error ? error.message : 'Unknown error',
//         };
//     }
// }

// /**
//  * Wait for a Composio connection to be established
//  * @param connectionRequest - The connection request from initiateComposioConnection
//  * @returns Connected account information
//  */
// export async function waitForComposioConnection(connectionRequest: any) {
//     try {
//         const connectedAccount = await connectionRequest.waitForConnection();
//         console.log(`Connection established successfully! Connected account id: ${connectedAccount.id}`);

//         return {
//             success: true,
//             connectedAccount,
//         };
//     } catch (error) {
//         console.error('Failed to wait for Composio connection:', error);
//         return {
//             success: false,
//             error: error instanceof Error ? error.message : 'Unknown error',
//         };
//     }
// }

// /**
//  * Complete Composio connection flow for a user
//  * @param userId - The user's email address
//  * @param authConfigId - The auth configuration ID
//  * @returns Complete connection flow result
//  */
// export async function completeComposioConnection(userId: string, authConfigId: string) {
//     const initiateResult = await initiateComposioConnection(userId, authConfigId);

//     if (!initiateResult.success) {
//         return initiateResult;
//     }

//     console.log(`Please authorize the app by visiting this URL: ${initiateResult.redirectUrl}`);

//     const waitResult = await waitForComposioConnection(initiateResult.connectionRequest);

//     return {
//         success: waitResult.success,
//         redirectUrl: initiateResult.redirectUrl,
//         connectedAccount: waitResult.success ? waitResult.connectedAccount : null,
//         error: waitResult.error,
//     };
// }

// export { composio, openai };
