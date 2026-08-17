const puppeteer = require('puppeteer-core');

const SHOP_URL = 'https://yard-singer-minus-drain.trycloudflare.com';
const GITHUB_URL = 'https://github.com/ronaldanton/x402-shop';
const DESCRIPTION = 'AI services behind HTTP 402 paywall. No accounts, no API keys — just pay with USDC on Base. Summarize ($0.01), classify insurance ($0.02), extract fields ($0.03).';

async function submitAgentLocker(browser) {
  console.log('\n=== Submitting to AgentLocker.ai ===');
  const page = await browser.newPage();
  
  try {
    await page.goto('https://agentlocker.ai/submit-your-tool', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // Take screenshot first
    await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/agentlocker-page.png', fullPage: true });
    
    // Try to find form fields
    const inputs = await page.$$('input');
    console.log(`  Found ${inputs.length} input fields`);
    
    // Try to find textareas
    const textareas = await page.$$('textarea');
    console.log(`  Found ${textareas.length} textarea fields`);
    
    // Try to find buttons
    const buttons = await page.$$('button');
    console.log(`  Found ${buttons.length} buttons`);
    
    // Get page content for debugging
    const content = await page.content();
    console.log(`  Page title: ${await page.title()}`);
    
  } catch (e) {
    console.log('  Error:', e.message);
  }
  await page.close();
}

async function main() {
  console.log('Connecting to running Chromium...\n');
  
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
    defaultViewport: null
  });
  
  await submitAgentLocker(browser);
  
  browser.disconnect();
  console.log('\n=== DONE ===');
}

main().catch(console.error);
