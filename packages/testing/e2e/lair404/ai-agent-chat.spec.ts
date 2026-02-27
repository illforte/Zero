import { test, expect } from '@playwright/test';
import { navigateToInbox, openAISidebar, sendAIMessage } from './helpers';

test.describe('lair404: AI Agent Chat', () => {
  // AI responses can be slow
  test.setTimeout(120_000);

  test('List email labels via AI sidebar', async ({ page }) => {
    await navigateToInbox(page);
    await openAISidebar(page);

    const response = await sendAIMessage(page, 'List all my email labels');

    console.log(`AI response (${response.length} chars): ${response.substring(0, 200)}`);
    expect(response.length).toBeGreaterThan(15);

    // Check that standard labels are mentioned (loose assertion)
    const lowerResponse = response.toLowerCase();
    const hasLabels =
      lowerResponse.includes('inbox') ||
      lowerResponse.includes('sent') ||
      lowerResponse.includes('label') ||
      lowerResponse.includes('draft');
    expect(hasLabels).toBe(true);
  });

  test('Find most recent email subject', async ({ page }) => {
    await navigateToInbox(page);
    await openAISidebar(page);

    const response = await sendAIMessage(
      page,
      'Find the most recent email and tell me its subject',
    );

    console.log(`AI response (${response.length} chars): ${response.substring(0, 200)}`);
    expect(response.length).toBeGreaterThan(10);

    // Should not contain error messages
    const hasError =
      response.toLowerCase().includes('error') && response.toLowerCase().includes('failed');
    expect(hasError).toBe(false);
  });

  test('Multi-turn conversation — search and follow-up', async ({ page }) => {
    await navigateToInbox(page);
    await openAISidebar(page);

    // First message
    const response1 = await sendAIMessage(page, 'Search emails from the last 3 days');
    console.log(`Turn 1 (${response1.length} chars): ${response1.substring(0, 150)}`);
    expect(response1.length).toBeGreaterThan(10);

    // Second message — follow-up
    const response2 = await sendAIMessage(page, 'How many did you find?');
    console.log(`Turn 2 (${response2.length} chars): ${response2.substring(0, 150)}`);
    expect(response2.length).toBeGreaterThan(5);

    // Verify we now have at least 2 assistant messages
    const assistantMessages = page.locator('[data-message-role="assistant"]');
    const count = await assistantMessages.count();
    console.log(`Total assistant messages: ${count}`);
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
