const { chromium } = require('playwright');

(async () => {
  console.log("Starting headless browser diagnostics...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`[BROWSER ${type.toUpperCase()}]: ${msg.text()}`);
    }
  });
  
  page.on('pageerror', err => {
    console.error(`[BROWSER EXCEPTION]: ${err.toString()}`);
  });

  try {
    console.log("Navigating to http://localhost:3000/city/cumming...");
    await page.goto('http://localhost:3000/city/cumming', { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log("Page loaded. Monitoring console for 5 seconds...");
    await page.waitForTimeout(5000);
    console.log("Diagnostics complete.");
  } catch (e) {
    console.error("Navigation or check failed:", e.message);
  } finally {
    await browser.close();
  }
})();
