const { chromium } = require('playwright');

const SHOP_URL = 'https://yard-singer-minus-drain.trycloudflare.com';
const GITHUB_URL = 'https://github.com/ronaldanton/x402-shop';
const DESCRIPTION = 'AI services behind HTTP 402 paywall. No accounts, no API keys — just pay with USDC on Base. Summarize ($0.01), classify insurance ($0.02), extract fields ($0.03).';
const DESCRIPTION_SHORT = 'AI services behind HTTP 402 paywall. Pay with USDC, no accounts needed.';

async function submitAgentLocker(browser) {
  console.log('\n=== Submitting to AgentLocker.ai ===');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://agentlocker.ai/submit-your-tool', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Fill in the form
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill('x402-shop');
      console.log('  Filled name');
    }
    
    const urlField = page.locator('input[name="url"], input[name="website"], input[placeholder*="url" i], input[placeholder*="website" i]').first();
    if (await urlField.count() > 0) {
      await urlField.fill(GITHUB_URL);
      console.log('  Filled URL');
    }
    
    const descField = page.locator('textarea[name="description"], textarea[placeholder*="description" i]').first();
    if (await descField.count() > 0) {
      await descField.fill(DESCRIPTION);
      console.log('  Filled description');
    }
    
    // Try to find and click submit button
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
    
    // Check if Cloudflare blocked
    const blocked = await page.locator('text=Attention Required').count();
    if (blocked > 0) {
      console.log('  Blocked by Cloudflare - need manual submission');
      await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/taaft-blocked.png' });
      await context.close();
      return;
    }
    
    // Fill in the form
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill('x402-shop');
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
    
    await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/taaft.png' });
  } catch (e) {
    console.log('  Error:', e.message);
  }
  await context.close();
}

async function submitHackerNews(browser) {
  console.log('\n=== Submitting to Hacker News ===');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://news.ycombinator.com/submit', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Fill title
    const titleField = page.locator('input[name="title"]').first();
    if (await titleField.count() > 0) {
      await titleField.fill('Show HN: x402-shop – AI services that accept USDC payments via HTTP 402');
      console.log('  Filled title');
    }
    
    // Fill URL
    const urlField = page.locator('input[name="url"]').first();
    if (await urlField.count() > 0) {
      await urlField.fill(GITHUB_URL);
      console.log('  Filled URL');
    }
    
    // Fill text (optional)
    const textField = page.locator('textarea[name="text"]').first();
    if (await textField.count() > 0) {
      await textField.fill('I built x402-shop, a live reference implementation of the x402 protocol for selling AI services. Three services: summarize ($0.01), insurance classifier ($0.02), field extractor ($0.03). Built with @x402/express on Base Mainnet. Open source on GitHub.');
      console.log('  Filled text');
    }
    
    const submitBtn = page.locator('input[type="submit"], button[type="submit"]').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      console.log('  Submitted!');
    }
    
    await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/hackernews.png' });
  } catch (e) {
    console.log('  Error:', e.message);
  }
  await context.close();
}

async function submitProductHunt(browser) {
  console.log('\n=== Submitting to Product Hunt ===');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://www.producthunt.com/posts/new', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Check if blocked
    const blocked = await page.locator('text=Attention Required').count();
    if (blocked > 0) {
      console.log('  Blocked by Cloudflare - need manual submission');
      await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/producthunt-blocked.png' });
      await context.close();
      return;
    }
    
    // Fill name
    const nameField = page.locator('input[placeholder*="name" i], input[name="name"]').first();
    if (await nameField.count() > 0) {
      await nameField.fill('x402-shop');
      console.log('  Filled name');
    }
    
    // Fill tagline
    const taglineField = page.locator('input[placeholder*="tagline" i], textarea[placeholder*="tagline" i]').first();
    if (await taglineField.count() > 0) {
      await taglineField.fill('AI services that accept crypto payments — no accounts needed');
      console.log('  Filled tagline');
    }
    
    // Fill description
    const descField = page.locator('textarea[placeholder*="description" i], textarea[name="description"]').first();
    if (await descField.count() > 0) {
      await descField.fill(DESCRIPTION);
      console.log('  Filled description');
    }
    
    // Fill website
    const urlField = page.locator('input[placeholder*="website" i], input[name="website"]').first();
    if (await urlField.count() > 0) {
      await urlField.fill(GITHUB_URL);
      console.log('  Filled website');
    }
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Submit")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      console.log('  Submitted!');
    }
    
    await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/producthunt.png' });
  } catch (e) {
    console.log('  Error:', e.message);
  }
  await context.close();
}

async function submitDevto(browser) {
  console.log('\n=== Submitting to Dev.to ===');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://dev.to/new', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Check if login required
    const loginRequired = await page.locator('text=Sign in').count();
    if (loginRequired > 0) {
      console.log('  Login required - need manual submission');
      await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/devto-login.png' });
      await context.close();
      return;
    }
    
    await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/devto.png' });
  } catch (e) {
    console.log('  Error:', e.message);
  }
  await context.close();
}

async function main() {
  console.log('Starting browser automation for x402-shop submissions...\n');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // Create screenshots directory
  const fs = require('fs');
  fs.mkdirSync('/root/x402-shop/marketing/screenshots', { recursive: true });
  
  // Run all submissions
  await submitAgentLocker(browser);
  await submitTAAFT(browser);
  await submitHackerNews(browser);
  await submitProductHunt(browser);
  await submitDevto(browser);
  
  await browser.close();
  
  console.log('\n=== DONE ===');
  console.log('Screenshots saved to /root/x402-shop/marketing/screenshots/');
  console.log('Check screenshots for submission status.');
}

main().catch(console.error);
