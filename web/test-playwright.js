const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to the topics page
  await page.goto('http://localhost:3001/topics');

  // Wait for the page to load
  await page.waitForSelector('text=Create Custom Topic', { timeout: 10000 });

  // Fill in the topic name
  await page.fill('input[placeholder="Topic name (e.g. \'Sailing\')"]', 'Sailing');

  // Click the Create button
  await page.click('button:has-text("Create")');

  // Wait for the topic to appear in the Following section
  try {
    await page.waitForSelector('text=Following', { timeout: 5000 });
    await page.waitForSelector('text=Sailing', { timeout: 10000 });
    console.log('SUCCESS: Topic was added and appears in the UI');
  } catch (e) {
    console.log('FAILURE: Topic did not appear in the UI');
    // Take a screenshot for debugging
    await page.screenshot({ path: '/tmp/topics-debug.png', fullPage: true });
  }

  await browser.close();
})();
