// Automated QA: undo (실행취소) button, all grid sizes. Checks that undo
// (a) decrements the move counter correctly, (b) doesn't crash at the
// boundary (undoing with nothing to undo), (c) actually reverses the
// cube's visual state back toward solved when undoing every move after a
// scramble (move count should return to 0).
import { chromium } from "playwright";

const SIZES = ["2×2", "3×3", "4×4", "5×5"];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = [];

async function readMoveCount(page) {
  const text = await page.locator("text=이동수").locator("..").innerText().catch(() => "");
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

for (const label of SIZES) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto("http://localhost:5173/");
  await page.waitForTimeout(1000);
  await page.getByText(label, { exact: true }).click();
  await page.waitForTimeout(600);

  // 1) Undo with nothing to undo -- should not crash.
  await page.getByText("실행취소", { exact: true }).click().catch(() => {});
  await page.waitForTimeout(300);
  const noopCrash = errors.length > 0;

  // 2) Scramble, note move count, undo that many times, verify it returns to 0.
  await page.getByText("스크램블", { exact: true }).click();
  await page.waitForTimeout(1200);
  const countAfterScramble = await readMoveCount(page);
  let undoClicks = 0;
  const maxUndo = (countAfterScramble ?? 30) + 5;
  while (undoClicks < maxUndo) {
    const current = await readMoveCount(page);
    if (current === 0) break;
    await page.getByText("실행취소", { exact: true }).click();
    undoClicks++;
    await page.waitForTimeout(150);
  }
  const finalCount = await readMoveCount(page);

  results.push({ label, noopCrash, countAfterScramble, undoClicks, finalCount, errorCount: errors.length, errors: errors.slice(0, 3) });
  console.log(`${label}: noopCrash=${noopCrash} countAfterScramble=${countAfterScramble} undoClicks=${undoClicks} finalCount=${finalCount} errors=${errors.length}`);
  if (errors.length) for (const e of errors.slice(0, 3)) console.log("  ERROR: " + e);
  await page.close();
}

console.log("\n=== SUMMARY ===");
const anyIssue = results.some((r) => r.errorCount > 0 || r.noopCrash || r.finalCount !== 0);
for (const r of results) {
  const ok = r.errorCount === 0 && !r.noopCrash && r.finalCount === 0;
  console.log(`${r.label}: ${ok ? "PASS" : "ISSUE"} (finalCount=${r.finalCount})`);
}
console.log(anyIssue ? "\nRESULT: ISSUES FOUND" : "\nRESULT: ALL CLEAN");
await browser.close();
