const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  // Launch browser in Node!
  const browserNode = await chromium.launch({ headless: true, args: ['--remote-debugging-port=9224'] });
  
  fs.writeFileSync('test_script.py', `
import time
from playwright.sync_api import Page
def test_dummy(page: Page):
    print("Python script running")
    page.goto('https://example.com')
    print("Navigated")
    time.sleep(3)
    print("Done")
  `);

  fs.writeFileSync('conftest.py', `
import pytest
import os
from playwright.sync_api import sync_playwright
@pytest.fixture(scope="session")
def browser(playwright):
    cdp = os.environ.get("PW_CDP_ENDPOINT")
    browser = playwright.chromium.connect_over_cdp(cdp)
    yield browser
  `);

  const child = spawn('pytest', ['test_script.py', '-s'], {
    env: { ...process.env, PW_CDP_ENDPOINT: 'http://localhost:9224' }
  });
  
  child.stdout.on('data', d => console.log('PY:', d.toString().trim()));
  child.stderr.on('data', d => console.log('PY ERR:', d.toString().trim()));

  // In Node, we can listen for new pages and stream them
  browserNode.on('targetcreated', async (target) => {
     if (target.type() === 'page') {
         const page = await target.page();
         const cdp = await page.context().newCDPSession(page);
         cdp.on('Page.screencastFrame', () => {
             console.log("Got frame from Python page!");
         });
         await cdp.send('Page.startScreencast');
     }
  });

  child.on('close', async () => {
      console.log("Python finished");
      await browserNode.close();
      fs.unlinkSync('test_script.py');
      fs.unlinkSync('conftest.py');
  });
}
run();
