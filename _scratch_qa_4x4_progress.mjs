import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto("http://localhost:5173/");
await page.waitForTimeout(1000);
await page.getByText("4×4", { exact: true }).click();
await page.waitForTimeout(600);
await page.getByText("스크램블", { exact: true }).click();
await page.waitForTimeout(1200);

async function readMoveCount() {
  const text = await page.locator("text=이동수").locator("..").innerText().catch(() => "");
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
async function waitForNotSolving(maxWaitMs) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const disabled = await page.getByText("솔브", { exact: true }).isDisabled().catch(() => null);
    if (!disabled) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

const initialCount = await readMoveCount();
console.log("initial move count (after scramble):", initialCount);

const counts = [];
for (let i = 0; i < 60; i++) {
  const solvedVisible = await page.getByText("완성", { exact: false }).isVisible().catch(() => false);
  if (solvedVisible) {
    console.log(`SOLVED at click ${i}`);
    break;
  }
  await page.getByText("솔브", { exact: true }).click({ timeout: 30000 });
  await waitForNotSolving(60000);
  const c = await readMoveCount();
  counts.push(c);
  if (i % 5 === 0 || i === 59) console.log(`after click ${i + 1}: moveCount=${c}`);
}

console.log("\nfull move count sequence:", counts.join(","));
await page.screenshot({ path: "/tmp/claude-0/-home-user-multi-cube/d01bc15d-ffee-5712-98e8-8761b814bbaa/scratchpad/4x4_progress_final.png" });
await browser.close();
