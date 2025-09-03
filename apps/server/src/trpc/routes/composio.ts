import { z } from "zod";
import { router, privateProcedure } from "../trpc";
import {
    initiateComposioConnection,
    waitForComposioConnection,
    completeComposioConnection,
    sendEmailWithComposio,
    createGmailTrigger,
    createGitHubIssue,
    createLinearIssue
} from "../../lib/composio";

export const composioRouter = router({
    /**
     * Initiate a Composio connection for a service
     */
    initiateConnection: privateProcedure
        .input(
            z.object({
                authConfigId: z.string().describe("The auth configuration ID for the service to connect"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.sessionUser?.email;

            if (!userId) {
                throw new Error("User not authenticated");
            }

            const result = await initiateComposioConnection(userId, input.authConfigId);

            if (!result.success) {
                throw new Error(result.error || "Failed to initiate connection");
            }

            return {
                redirectUrl: result.redirectUrl,
                message: "Please visit the redirect URL to authorize the connection",
            };
        }),

    /**
     * Wait for a Composio connection to be established
     */
    waitForConnection: privateProcedure
        .input(
            z.object({
                connectionRequest: z.any().describe("The connection request object from initiateConnection"),
            })
        )
        .mutation(async ({ input }) => {
            const result = await waitForComposioConnection(input.connectionRequest);

            if (!result.success) {
                throw new Error(result.error || "Failed to wait for connection");
            }

            return {
                connectedAccount: result.connectedAccount,
                message: "Connection established successfully",
            };
        }),

    /**
     * Complete the full Composio connection flow
     */
    completeConnection: privateProcedure
        .input(
            z.object({
                authConfigId: z.string().describe("The auth configuration ID for the service to connect"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.sessionUser?.email;

            if (!userId) {
                throw new Error("User not authenticated");
            }

            const result = await completeComposioConnection(userId, input.authConfigId);

            if (!result.success) {
                throw new Error(result.error || "Failed to complete connection");
            }

            return {
                redirectUrl: result.redirectUrl,
                connectedAccount: 'connectedAccount' in result ? result.connectedAccount : null,
                message: "Connection flow completed successfully",
            };
        }),

    /**
     * Send an email using Composio and AI
     */
    sendEmail: privateProcedure
        .input(
            z.object({
                to: z.string().email(),
                subject: z.string(),
                body: z.string(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.sessionUser?.email;

            if (!userId) {
                throw new Error("User not authenticated");
            }

            const result = await sendEmailWithComposio(
                userId,
                input.to,
                input.subject,
                input.body
            );

            if (!result.success) {
                throw new Error(result.error || "Failed to send email");
            }

            return {
                success: true,
                result: result.result,
                message: "Email sent successfully",
            };
        }),

    /**
     * Create a Gmail trigger for new messages
     */
    createGmailTrigger: privateProcedure
        .input(
            z.object({
                connectedAccountId: z.string(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.sessionUser?.email;

            if (!userId) {
                throw new Error("User not authenticated");
            }

            const result = await createGmailTrigger(userId, input.connectedAccountId);

            if (!result.success) {
                throw new Error(result.error || "Failed to create trigger");
            }

            return {
                success: true,
                trigger: result.trigger,
                message: "Gmail trigger created successfully",
            };
        }),

    /**
     * Create a GitHub issue using Composio and AI
     */
    createGitHubIssue: privateProcedure
        .input(
            z.object({
                title: z.string(),
                body: z.string(),
                repository: z.string(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.sessionUser?.email;

            if (!userId) {
                throw new Error("User not authenticated");
            }

            const result = await createGitHubIssue(
                userId,
                input.title,
                input.body,
                input.repository
            );

            if (!result.success) {
                throw new Error(result.error || "Failed to create GitHub issue");
            }

            return {
                success: true,
                result: result.result,
                message: "GitHub issue created successfully",
            };
        }),

    /**
     * Create a Linear issue using Composio and AI
     */
    createLinearIssue: privateProcedure
        .input(
            z.object({
                title: z.string(),
                description: z.string(),
                teamId: z.string(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.sessionUser?.email;

            if (!userId) {
                throw new Error("User not authenticated");
            }

            const result = await createLinearIssue(
                userId,
                input.title,
                input.description,
                input.teamId
            );

            if (!result.success) {
                throw new Error(result.error || "Failed to create Linear issue");
            }

            return {
                success: true,
                result: result.result,
                message: "Linear issue created successfully",
            };
        }),
});
