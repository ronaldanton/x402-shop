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
    
    // Find all input fields
    const inputs = await page.$$('input');
    console.log(`  Found ${inputs.length} input fields`);
    
    // Try to fill name field
    const nameInput = await page.$('input[name="name"], input[placeholder*="name" i]');
    if (nameInput) {
      await nameInput.click({ clickCount: 3 });
      await nameInput.type('x402-shop');
      console.log('  Filled name: x402-shop');
    }
    
    // Try to fill URL field
    const urlInput = await page.$('input[name="url"], input[name="website"], input[placeholder*="url" i], input[placeholder*="website" i]');
    if (urlInput) {
      await urlInput.click({ clickCount: 3 });
      await urlInput.type(GITHUB_URL);
      console.log('  Filled URL');
    }
    
    // Try to fill description
    const descInput = await page.$('textarea[name="description"], textarea[placeholder*="description" i]');
    if (descInput) {
      await descInput.click();
      await descInput.type(DESCRIPTION);
      console.log('  Filled description');
    }
    
    // Take screenshot after filling
    await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/agentlocker-filled.png', fullPage: true });
    console.log('  Screenshot saved');
    
    // Find and click submit button
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('  Clicked submit!');
      await new Promise(r => setTimeout(r, 5000));
      await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/agentlocker-submitted.png', fullPage: true });
    }
    
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
