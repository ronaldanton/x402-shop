const { chromium } = require('playwright');

const SHOP_URL = 'https://agentpay.help';
const GITHUB_URL = 'https://github.com/ronaldanton/x402-shop';
const DESCRIPTION = 'AI services behind HTTP 402 paywall. No accounts, no API keys — just pay with USDC on Base. Summarize ($0.01), classify insurance ($0.02), extract fields ($0.03), sentiment ($0.02), translate ($0.03), code review ($0.05), full analysis ($0.10).';
const DESCRIPTION_SHORT = 'AI microservices behind x402 paywall. Pay per call in USDC on Base. No accounts needed.';

async function submitAgentLocker(browser) {
  console.log('\n=== Submitting to AgentLocker.ai ===');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://agentlocker.ai/submit-your-tool', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill('AgentPay');
      console.log('  Filled name');
    }
    
    const urlField = page.locator('input[name="url"], input[name="website"], input[placeholder*="url" i], input[placeholder*="website" i]').first();
    if (await urlField.count() > 0) {
      await urlField.fill(SHOP_URL);
      console.log('  Filled URL');
    }
    
    const descField = page.locator('textarea[name="description"], textarea[placeholder*="description" i]').first();
    if (await descField.count() > 0) {
      await descField.fill(DESCRIPTION);
      console.log('  Filled description');
    }
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Add")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      console.log('  Submitted!');
    }
    
    await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/agentlocker.png' });
  } catch (e) {
    console.log('  Error:', e.message);
  }
  await context.close();
}

async function submitTAAFT(browser) {
  console.log('\n=== Submitting to theresanaiforthat.com ===');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://theresanaiforthat.com/submit/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const blocked = await page.locator('text=Attention Required').count();
    if (blocked > 0) {
      console.log('  Blocked by Cloudflare - need manual submission');
      await context.close();
      return;
    }
    
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill('AgentPay');
      console.log('  Filled name');
    }
    
    const urlField = page.locator('input[name="url"], input[name="website"], input[placeholder*="url" i]').first();
    if (await urlField.count() > 0) {
      await urlField.fill(SHOP_URL);
      console.log('  Filled URL');
    }
    
    const descField = page.locator('textarea[name="description"], textarea[placeholder*="description" i]').first();
    if (await descField.count() > 0) {
      await descField.fill(DESCRIPTION_SHORT);
      console.log('  Filled description');
    }
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Submit")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      console.log('  Submitted!');
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
  await context.close();
}

async function submitFutureTools(browser) {
  console.log('\n=== Submitting to futuretools.io ===');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://futuretools.io/submit', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill('AgentPay');
      console.log('  Filled name');
    }
    
    const urlField = page.locator('input[name="url"], input[placeholder*="website" i]').first();
    if (await urlField.count() > 0) {
      await urlField.fill(SHOP_URL);
      console.log('  Filled URL');
    }
    
    const descField = page.locator('textarea[placeholder*="description" i]').first();
    if (await descField.count() > 0) {
      await descField.fill(DESCRIPTION);
      console.log('  Filled description');
    }
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Submit")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      console.log('  Submitted!');
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
  await context.close();
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  
  try {
    await submitAgentLocker(browser);
    await submitTAAFT(browser);
    await submitFutureTools(browser);
    
    console.log('\n✅ All submissions attempted!');
    console.log('\n📋 Platforms needing manual submission:');
    console.log('  - Product Hunt: https://www.producthunt.com/posts/new');
    console.log('  - Hacker News: https://news.ycombinator.com/submit');
    console.log('  - Reddit: r/SideProject, r/artificial');
    console.log('  - Dev.to: Write an article about the x402 protocol');
  } catch (e) {
    console.error('Fatal error:', e.message);
  }
  
  await browser.close();
}

run();
