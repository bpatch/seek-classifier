const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://www.seek.com.au/jobs?keywords=nurse');
  await page.waitForTimeout(3000);
  
  // Find job cards and their advertiser elements
  const data = await page.evaluate(() => {
    const jobCards = Array.from(document.querySelectorAll('article'));
    if (!jobCards.length) return "No articles found";
    
    // Find all data-automation attributes inside the first job card
    const elements = jobCards[0].querySelectorAll('[data-automation]');
    return Array.from(elements).map(el => el.getAttribute('data-automation'));
  });
  
  console.log(data);
  await browser.close();
})();
