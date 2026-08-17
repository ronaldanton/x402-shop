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
    
    // Get all form elements
    const formInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const textareas = Array.from(document.querySelectorAll('textarea'));
      const selects = Array.from(document.querySelectorAll('select'));
      const buttons = Array.from(document.querySelectorAll('button'));
      
      return {
        inputs: inputs.map((el, i) => ({
          index: i,
          type: el.type,
          name: el.name,
          placeholder: el.placeholder,
          id: el.id,
          className: el.className.substring(0, 50)
        })),
        textareas: textareas.map((el, i) => ({
          index: i,
          name: el.name,
          placeholder: el.placeholder,
          id: el.id
        })),
        selects: selects.map((el, i) => ({
          index: i,
          name: el.name,
          id: el.id,
          options: Array.from(el.options).map(o => o.text).slice(0, 5)
        })),
        buttons: buttons.map((el, i) => ({
          index: i,
          type: el.type,
          text: el.textContent.substring(0, 30),
          className: el.className.substring(0, 50)
        }))
      };
    });
    
    console.log('  Inputs:', JSON.stringify(formInfo.inputs, null, 2));
    console.log('  Textareas:', JSON.stringify(formInfo.textareas, null, 2));
    console.log('  Selects:', JSON.stringify(formInfo.selects, null, 2));
    console.log('  Buttons:', JSON.stringify(formInfo.buttons, null, 2));
    
    // Try to fill using evaluate
    const filled = await page.evaluate((desc) => {
      // Find name input
      const nameInput = document.querySelector('input[placeholder*="name" i], input[name*="name" i]');
      if (nameInput) {
        nameInput.value = 'x402-shop';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // Find URL input
      const urlInput = document.querySelector('input[placeholder*="url" i], input[name*="url" i], input[placeholder*="website" i]');
      if (urlInput) {
        urlInput.value = 'https://github.com/ronaldanton/x402-shop';
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        urlInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // Find description textarea
      const descTextarea = document.querySelector('textarea[placeholder*="description" i], textarea[name*="description" i]');
      if (descTextarea) {
        descTextarea.value = desc;
        descTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        descTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      return {
        nameFound: !!nameInput,
        urlFound: !!urlInput,
        descFound: !!descTextarea
      };
    }, DESCRIPTION);
    
    console.log('  Fill results:', filled);
    
    await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/agentlocker-filled2.png', fullPage: true });
    console.log('  Screenshot saved');
    
    // Try to submit
    const submitted = await page.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
        return true;
      }
      return false;
    });
    
    if (submitted) {
      console.log('  Clicked submit!');
      await new Promise(r => setTimeout(r, 5000));
      await page.screenshot({ path: '/root/x402-shop/marketing/screenshots/agentlocker-submitted2.png', fullPage: true });
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
