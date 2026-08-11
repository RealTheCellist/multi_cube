// Automated QA: for each grid size, scramble then repeatedly click the
// solve-hint button until the completion modal ("완성") appears (or a
// generous max-click cap is hit, in case of an infinite loop bug).
// Checks console/page errors throughout, and records how many clicks the
// solve took.
import { chromium } from "playwright";

const SIZES = [
  { label: "2×2", maxClicks: 40 },
  { label: "3×3", maxClicks: 60 },
  { label: "4×4", maxClicks: 250 },
  { label: "5×5", maxClicks: 400 },
];
const TRIALS_PER_SIZE = 2;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = [];

for (const { label, maxClicks } of SIZES) {
  for (let trial = 1; trial <= TRIALS_PER_SIZE; trial++) {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    const errors = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("http://localhost:5173/");
    await page.waitForTimeout(1000);
    await page.getByText(label, { exact: true }).click();
    await page.waitForTimeout(600);

    await page.getByText("스크램블", { exact: true }).click();
    await page.waitForTimeout(1200);

    let clicks = 0;
    let solved = false;
    const start = Date.now();
    while (clicks < maxClicks) {
      const completionVisible = await page.getByText("완성", { exact: false }).isVisible().catch(() => false);
      if (completionVisible) {
        solved = true;
        break;
      }
      try {
        await page.getByText("솔브", { exact: true }).click({ timeout: 3000 });
      } catch {
        // Most likely the completion modal appeared and is now blocking
        // the button -- re-check completion below instead of failing.
        const nowSolved = await page.getByText("완성", { exact: false }).isVisible().catch(() => false);
        if (nowSolved) {
          solved = true;
          break;
        }
        throw new Error(`click failed and not solved (click #${clicks})`);
      }
      clicks++;
      await page.waitForTimeout(220);
    }
    // one more check after the loop in case the last click's modal is still animating in
    if (!solved) {
      await page.waitForTimeout(300);
      solved = await page.getByText("완성", { exact: false }).isVisible().catch(() => false);
    }
    const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);

    results.push({ label, trial, solved, clicks, elapsedSec, errorCount: errors.length, errors: errors.slice(0, 3) });
    console.log(`${label} trial ${trial}: solved=${solved} clicks=${clicks} elapsed=${elapsedSec}s errors=${errors.length}`);
    if (errors.length) for (const e of errors.slice(0, 3)) console.log("  ERROR: " + e);
    await page.close();
  }
}

console.log("\n=== SUMMARY ===");
for (const r of results) {
  console.log(`${r.label} trial ${r.trial}: ${r.solved ? "PASS" : "FAIL (not solved within cap)"}, ${r.clicks} clicks, ${r.errorCount} errors`);
}
const anyFail = results.some((r) => !r.solved || r.errorCount > 0);
console.log(anyFail ? "\nRESULT: ISSUES FOUND" : "\nRESULT: ALL CLEAN");

await browser.close();
