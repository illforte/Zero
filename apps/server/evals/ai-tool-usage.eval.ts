import { evalite } from "evalite";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { traceAISDKModel } from "evalite/ai-sdk";
import { Factuality, EmbeddingSimilarity } from "autoevals";
import { AiChatPrompt, GmailSearchAssistantSystemPrompt, StyledEmailAssistantSystemPrompt } from "../src/lib/prompts";

// base model (untraced) for internal helpers to avoid trace errors
const baseModel = openai("gpt-4o-mini");

// traced model for the actual task under test
const model = traceAISDKModel(baseModel);

const safeStreamText = async (config: Parameters<typeof streamText>[0]) => {
    try {
        const res = await streamText(config);
        return res.textStream;
    } catch (err) {
        console.error("LLM call failed", err);
        return "ERROR";
    }
};

// Test case type for tool usage evaluation
type ToolTestCase = {
    input: string;
    expectedTool: string;
    expectedBehavior: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    description: string;
};

// Static test cases for tool usage evaluation
const TOOL_USAGE_TEST_CASES: ToolTestCase[] = [
    // Basic tool usage tests
    {
        input: "Show me my unread emails from the last 3 days",
        expectedTool: "getThread",
        expectedBehavior: "should call getThread with appropriate filters for unread emails and date range",
        category: "search_retrieval",
        difficulty: "easy",
        description: "Basic search with date filter"
    },
    {
        input: "Create a new label called 'Urgent' with red color",
        expectedTool: "createLabel",
        expectedBehavior: "should call createLabel with name 'Urgent' and red color",
        category: "label_management",
        difficulty: "easy",
        description: "Label creation with color specification"
    },
    {
        input: "Archive all emails older than 60 days that are not starred",
        expectedTool: "bulkArchive",
        expectedBehavior: "should call bulkArchive with filters for date and star status",
        category: "bulk_operations",
        difficulty: "medium",
        description: "Complex bulk operation with multiple filters"
    },
    {
        input: "Find emails from john@company.com with attachments sent this month",
        expectedTool: "getThread",
        expectedBehavior: "should call getThread with filters for sender, attachments, and date",
        category: "search_retrieval",
        difficulty: "medium",
        description: "Multi-criteria search"
    },
    {
        input: "Mark all emails from newsletters as read and apply 'Newsletter' label",
        expectedTool: "modifyLabels",
        expectedBehavior: "should call modifyLabels to apply 'Newsletter' label and mark as read",
        category: "label_management",
        difficulty: "medium",
        description: "Combined label and status modification"
    },
    {
        input: "Delete all spam emails and empty the trash",
        expectedTool: "bulkDelete",
        expectedBehavior: "should call bulkDelete for spam emails and handle trash cleanup",
        category: "bulk_operations",
        difficulty: "hard",
        description: "Complex cleanup operation"
    },
    {
        input: "Summarize the conversation thread about project Alpha",
        expectedTool: "getThreadSummary",
        expectedBehavior: "should call getThreadSummary for the specified thread",
        category: "summarization",
        difficulty: "medium",
        description: "Thread summarization request"
    },
    {
        input: "What's the current weather in San Francisco?",
        expectedTool: "webSearch",
        expectedBehavior: "should call webSearch for current weather information",
        category: "web_search",
        difficulty: "easy",
        description: "Web search request"
    },
    {
        input: "Compose a professional follow-up email to the meeting request from Sarah",
        expectedTool: "composeEmail",
        expectedBehavior: "should call composeEmail with professional tone and context awareness",
        category: "email_composition",
        difficulty: "medium",
        description: "Context-aware email composition"
    },
    {
        input: "Organize my inbox by creating priority levels: High, Medium, Low",
        expectedTool: "createLabel",
        expectedBehavior: "should call createLabel multiple times to create priority label hierarchy",
        category: "organization",
        difficulty: "hard",
        description: "Complex organizational structure creation"
    }
];

// Gmail search specific test cases
const GMAIL_SEARCH_TEST_CASES: ToolTestCase[] = [
    {
        input: "Find emails from my boss that are unread and have attachments",
        expectedTool: "from:",
        expectedBehavior: "should generate search query with from:, is:unread, and has:attachment",
        category: "gmail_search",
        difficulty: "medium",
        description: "Complex Gmail search with multiple operators"
    },
    {
        input: "Show me emails from last week that contain the word 'invoice'",
        expectedTool: "after:",
        expectedBehavior: "should generate search query with date filter and text search",
        category: "gmail_search",
        difficulty: "easy",
        description: "Date-based text search"
    },
    {
        input: "Find emails from Gmail that are starred and in the 'Work' folder",
        expectedTool: "is:starred",
        expectedBehavior: "should generate search query combining star status and label",
        category: "gmail_search",
        difficulty: "medium",
        description: "Status and label combination search"
    }
];

// Email composition test cases
const EMAIL_COMPOSITION_TEST_CASES: ToolTestCase[] = [
    {
        input: "Write a thank you email to the interviewer after my job interview",
        expectedTool: "composeEmail",
        expectedBehavior: "should compose professional thank you email with appropriate tone",
        category: "email_composition",
        difficulty: "medium",
        description: "Professional thank you email"
    },
    {
        input: "Draft a meeting cancellation email to the team",
        expectedTool: "composeEmail",
        expectedBehavior: "should compose clear cancellation notice with appropriate details",
        category: "email_composition",
        difficulty: "easy",
        description: "Meeting cancellation notice"
    },
    {
        input: "Create an apology email for missing the deadline",
        expectedTool: "composeEmail",
        expectedBehavior: "should compose sincere apology with explanation and next steps",
        category: "email_composition",
        difficulty: "medium",
        description: "Apology email with accountability"
    }
];

// Static edge case test cases (no dynamic generation to avoid EmbeddingSimilarity errors)
const EDGE_CASE_TEST_CASES: ToolTestCase[] = [
    {
        input: "Archive emails from 10 years ago",
        expectedTool: "bulkArchive",
        expectedBehavior: "should handle very old date gracefully and suggest reasonable date range",
        category: "boundary_conditions",
        difficulty: "medium",
        description: "Very old date handling"
    },
    {
        input: "Create a label with special characters: !@#$%^&*()",
        expectedTool: "createLabel",
        expectedBehavior: "should sanitize special characters and create valid label name",
        category: "invalid_inputs",
        difficulty: "easy",
        description: "Special character handling in label names"
    },
    {
        input: "Delete all emails from the year 9999",
        expectedTool: "bulkDelete",
        expectedBehavior: "should reject invalid future date and suggest current date range",
        category: "invalid_inputs",
        difficulty: "easy",
        description: "Invalid future date handling"
    },
    {
        input: "Find emails with empty sender address",
        expectedTool: "getThread",
        expectedBehavior: "should handle empty sender gracefully and provide helpful error message",
        category: "edge_cases",
        difficulty: "medium",
        description: "Empty sender address handling"
    },
    {
        input: "Create a label with 1000 character name",
        expectedTool: "createLabel",
        expectedBehavior: "should truncate or reject overly long label names",
        category: "boundary_conditions",
        difficulty: "medium",
        description: "Very long label name handling"
    },
    {
        input: "Archive emails from sender: ''",
        expectedTool: "bulkArchive",
        expectedBehavior: "should reject empty sender and ask for valid sender information",
        category: "error_handling",
        difficulty: "easy",
        description: "Empty sender validation"
    }
];

// Advanced features test cases
const ADVANCED_FEATURES_TEST_CASES: ToolTestCase[] = [
    {
        input: "Create a workflow to automatically label emails from 'noreply@' as 'Spam'",
        expectedTool: "createWorkflow",
        expectedBehavior: "should call createWorkflow to create a new workflow that labels 'noreply@' emails as 'Spam'",
        category: "automation",
        difficulty: "medium",
        description: "Workflow creation for automated labeling"
    },
    {
        input: "Integrate with a calendar application to automatically book meetings",
        expectedTool: "integrateCalendar",
        expectedBehavior: "should call integrateCalendar to establish a connection with a calendar app",
        category: "integrations",
        difficulty: "hard",
        description: "Calendar integration for automatic booking"
    },
    {
        input: "Encrypt all emails in the 'Work' folder using PGP",
        expectedTool: "encryptEmails",
        expectedBehavior: "should call encryptEmails to apply PGP encryption to all emails in the 'Work' folder",
        category: "security",
        difficulty: "hard",
        description: "PGP encryption for email security"
    },
    {
        input: "Create a template for 'Project Report' that includes a pre-filled table of contents",
        expectedTool: "createTemplate",
        expectedBehavior: "should call createTemplate to create a new template with pre-filled content",
        category: "templates",
        difficulty: "easy",
        description: "Template creation with pre-filled content"
    },
    {
        input: "Backup all emails to a cloud storage service",
        expectedTool: "backupEmails",
        expectedBehavior: "should call backupEmails to initiate an email backup process",
        category: "backup",
        difficulty: "hard",
        description: "Email backup to cloud storage"
    },
    {
        input: "Analyze email patterns to identify common issues and suggest improvements",
        expectedTool: "analyzeEmails",
        expectedBehavior: "should call analyzeEmails to generate a report on email usage patterns",
        category: "analytics",
        difficulty: "medium",
        description: "Email analytics for performance monitoring"
    }
];

// Helper function to convert test cases to evalite format
const makeTestCaseProvider = (testCases: ToolTestCase[]) => {
    return async () => testCases.map(tc => ({
        input: tc.input,
        expected: `${tc.expectedTool}: ${tc.expectedBehavior}`
    }));
};

// Tool usage evaluation tests
evalite("Tool Usage - Search & Retrieval", {
    data: makeTestCaseProvider(TOOL_USAGE_TEST_CASES.filter(tc => tc.category === 'search_retrieval')),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

evalite("Tool Usage - Label Management", {
    data: makeTestCaseProvider(TOOL_USAGE_TEST_CASES.filter(tc => tc.category === 'label_management')),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

evalite("Tool Usage - Bulk Operations", {
    data: makeTestCaseProvider(TOOL_USAGE_TEST_CASES.filter(tc => tc.category === 'bulk_operations')),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

evalite("Tool Usage - Summarization", {
    data: makeTestCaseProvider(TOOL_USAGE_TEST_CASES.filter(tc => tc.category === 'summarization')),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

evalite("Tool Usage - Web Search", {
    data: makeTestCaseProvider(TOOL_USAGE_TEST_CASES.filter(tc => tc.category === 'web_search')),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

evalite("Tool Usage - Email Composition", {
    data: makeTestCaseProvider(TOOL_USAGE_TEST_CASES.filter(tc => tc.category === 'email_composition')),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: StyledEmailAssistantSystemPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

evalite("Tool Usage - Organization", {
    data: makeTestCaseProvider(TOOL_USAGE_TEST_CASES.filter(tc => tc.category === 'organization')),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

// Gmail search specific evaluation
evalite("Gmail Search - Complex Queries", {
    data: makeTestCaseProvider(GMAIL_SEARCH_TEST_CASES),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: GmailSearchAssistantSystemPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

// Email composition specific evaluation
evalite("Email Composition - Professional Communication", {
    data: makeTestCaseProvider(EMAIL_COMPOSITION_TEST_CASES),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: StyledEmailAssistantSystemPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

// Edge cases evaluation using static test cases only
evalite("Tool Usage - Edge Cases & Error Handling", {
    data: makeTestCaseProvider(EDGE_CASE_TEST_CASES),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

// Advanced features evaluation
evalite("Advanced Features - Automation & Workflows", {
    data: makeTestCaseProvider(ADVANCED_FEATURES_TEST_CASES.filter(tc =>
        ['automation', 'workflow'].includes(tc.category)
    )),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

evalite("Advanced Features - Integrations & Security", {
    data: makeTestCaseProvider(ADVANCED_FEATURES_TEST_CASES.filter(tc =>
        ['integrations', 'security'].includes(tc.category)
    )),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});

evalite("Advanced Features - Templates & Knowledge Management", {
    data: makeTestCaseProvider(ADVANCED_FEATURES_TEST_CASES.filter(tc =>
        ['templates', 'knowledge_management', 'analytics', 'backup'].includes(tc.category)
    )),
    task: async (input) => {
        return safeStreamText({
            model: model,
            system: AiChatPrompt(),
            prompt: input,
        });
    },
    scorers: [Factuality, EmbeddingSimilarity],
});
