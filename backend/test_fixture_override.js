const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  const browserNode = await chromium.launch({ headless: true, args: ['--remote-debugging-port=9225'] });
  const contextNode = await browserNode.newContext();
  const pageNode = await contextNode.newPage();

  // Attach CDP to capture frames!
  const cdp = await pageNode.context().newCDPSession(pageNode);
  cdp.on('Page.screencastFrame', () => {
    console.log("Got frame in Node!");
  });
  await cdp.send('Page.startScreencast');

  fs.writeFileSync('test_script.py', `
from playwright.sync_api import Page
def test_dummy(page: Page):
    print("Python script running")
    page.goto('https://example.com')
    print("Navigated, URL is", page.url)
  `);

  fs.writeFileSync('conftest.py', `
import pytest
import os
from playwright.sync_api import sync_playwright

@pytest.fixture(scope="session")
def playwright_instance():
    with sync_playwright() as p:
        yield p

@pytest.fixture(scope="session")
def browser(playwright_instance):
    cdp = os.environ.get("PW_CDP_ENDPOINT")
    browser = playwright_instance.chromium.connect_over_cdp(cdp)
    yield browser

@pytest.fixture
def context(browser):
    ctx = browser.contexts[0]
    yield ctx

@pytest.fixture
def page(context):
    p = context.pages[0] if context.pages else context.new_page()
    yield p
  `);

  const child = spawn('pytest', ['test_script.py', '-s'], {
    env: { ...process.env, PW_CDP_ENDPOINT: 'http://localhost:9225' }
  });
  
  child.stdout.on('data', d => console.log('PY:', d.toString().trim()));
  child.stderr.on('data', d => console.log('PY ERR:', d.toString().trim()));

  child.on('close', async () => {
      console.log("Python finished");
      await browserNode.close();
      fs.unlinkSync('test_script.py');
      fs.unlinkSync('conftest.py');
  });
}
run();
