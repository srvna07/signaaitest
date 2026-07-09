const { chromium } = require('playwright');
const username = 'signauser';
const password = 'W9@g@JtC';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating...');
  await page.goto('https://dev.signainsights.com/', { waitUntil: 'networkidle' });
  
  console.log('Typing...');
  await page.waitForSelector('#username');
  await page.fill('#username', username);
  await page.fill('#password', password);
  
  console.log('Clicking...');
  await page.click('button[type="submit"], button:has-text("Login")');
  
  console.log('Waiting for navigation...');
  await page.waitForTimeout(5000); // wait 5 seconds to see what happens
  
  const currentUrl = page.url();
  console.log('URL after login:', currentUrl);
  
  const pwVisible = await page.$eval('#password', el => el.offsetParent !== null).catch(() => false);
  console.log('Is password field still visible?', pwVisible);
  
  if (currentUrl.includes('/dashboard') || !pwVisible) {
    console.log('Login SUCCESSFUL in test script');
  } else {
    console.log('Login FAILED in test script. Taking screenshot...');
    await page.screenshot({ path: 'test_fail.png' });
  }
  
  await browser.close();
})();
