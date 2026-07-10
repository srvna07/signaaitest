const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  const browserServer = await chromium.launchServer({ headless: true });
  const wsEndpoint = browserServer.wsEndpoint();
  console.log("WS Endpoint:", wsEndpoint);

  // Monitor client
  const monitorBrowser = await chromium.connect(wsEndpoint);
  monitorBrowser.on('page', (page) => {
      console.log("MONITOR: new page created!");
  });
  
  // Create another client (simulating python)
  const pythonBrowser = await chromium.connect(wsEndpoint);
  const ctx = await pythonBrowser.newContext();
  const page = await ctx.newPage();
  console.log("PYTHON: created page");
  await page.goto('https://example.com');
  console.log("PYTHON: navigated");

  await new Promise(r => setTimeout(r, 2000));
  await browserServer.close();
}
run();
