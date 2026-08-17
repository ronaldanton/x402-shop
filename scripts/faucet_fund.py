#!/usr/bin/env python3
"""Fund test wallets via faucet.circle.com (Base Sepolia: USDC + ETH) — v2."""
import sys, time, json, os

from cloakbrowser import launch

WALLET = "0x5E7F5Bfc881F70a43415b3c01866F4e5b3e136da"
OUT = "/tmp/faucet-result.json"

def dump_page(page, label):
    print(f"--- {label} ---", flush=True)
    try:
        body = page.inner_text("body")
        print(body[:1200], flush=True)
    except Exception as e:
        print("body read fail:", e, flush=True)
    # inputs
    for el in page.query_selector_all("input, select, button, [role=tab]"):
        try:
            tag = el.evaluate("e=>e.tagName")
            attrs = el.evaluate("e=>({id:e.id,name:e.name,placeholder:e.placeholder,type:e.type,text:(e.innerText||'').slice(0,40),disabled:e.disabled})")
            print(f"  <{tag}> {attrs}", flush=True)
        except Exception:
            pass
    print("--- end dump ---", flush=True)

def main():
    browser = launch(headless=True, humanize=True)
    try:
        page = browser.new_page()
        print("loading faucet.circle.com ...", flush=True)
        page.goto("https://faucet.circle.com/", timeout=90000, wait_until="domcontentloaded")
        time.sleep(8)  # let Next.js hydrate + Turnstile mount
        dump_page(page, "initial state")
        page.screenshot(path="/tmp/faucet-1.png", full_page=False)

        # fill wallet
        filled = False
        for sel in ['input[placeholder*="ddress" i]', 'input[name*="address" i]', 'input[autocomplete*="off"][type="text"]', 'input[type="text"]']:
            try:
                el = page.query_selector(sel)
                if el and el.is_visible():
                    el.click()
                    el.fill("")
                    el.type(WALLET, delay=40)
                    filled = True
                    print(f"filled wallet via {sel}", flush=True)
                    break
            except Exception:
                continue
        if not filled:
            print("NO WALLET INPUT FOUND", flush=True)
            page.screenshot(path="/tmp/faucet-fail.png", full_page=True)
            return 1
        time.sleep(2)

        # choose chain: look for combobox/select with 'Base Sepolia'
        try:
            page.click("text=Base Sepolia", timeout=3000)
            print("clicked 'Base Sepolia' text", flush=True)
        except Exception:
            for sel in ["select", '[role=combobox]', 'button:has-text("network")', 'button:has-text("chain")']:
                try:
                    el = page.query_selector(sel)
                    if el and el.is_visible():
                        el.click(); time.sleep(1)
                        try:
                            page.click("text=Base Sepolia", timeout=3000)
                            print("selected Base Sepolia in dropdown", flush=True)
                        except Exception:
                            pass
                        break
                except Exception:
                    continue

        # choose asset USDC
        try:
            page.click('button:has-text("USDC")', timeout=3000)
            print("selected USDC", flush=True)
        except Exception:
            print("USDC button not found (maybe default)", flush=True)

        time.sleep(2)
        dump_page(page, "before submit")
        page.screenshot(path="/tmp/faucet-2.png")

        # submit — wait for turnstile auto-resolve up to 20s
        submitted = False
        for attempt in range(20):
            for sel in ['button:has-text("Claim")', 'button:has-text("Get")', 'button:has-text("Request")', 'button:has-text("Send")', 'button[type=submit]']:
                try:
                    el = page.query_selector(sel)
                    if el and el.is_visible() and el.is_enabled():
                        el.click()
                        submitted = True
                        print(f"clicked submit ({sel}) at attempt {attempt}", flush=True)
                        break
                except Exception:
                    continue
            if submitted:
                break
            time.sleep(1)
        if not submitted:
            print("SUBMIT BUTTON NEVER ENABLED — turnstile likely blocking", flush=True)
            page.screenshot(path="/tmp/faucet-fail2.png", full_page=True)
            return 1

        # confirmation
        time.sleep(10)
        body = page.inner_text("body")
        ok = any(k.lower() in body.lower() for k in ["transaction", "success", "sent", "explorer", "confirmed", "0x"])
        print("post-submit text:", body[:600].replace("\n", " | "), flush=True)
        page.screenshot(path="/tmp/faucet-3.png")
        json.dump({"wallet": WALLET, "ok": ok, "ts": time.time()}, open(OUT, "w"))
        print("RESULT:", "FUNDED (probably)" if ok else "UNCLEAR — check /tmp/faucet-3.png", flush=True)
        return 0 if ok else 1
    finally:
        browser.close()

if __name__ == "__main__":
    sys.exit(main())
