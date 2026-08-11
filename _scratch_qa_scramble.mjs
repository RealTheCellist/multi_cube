// Automated QA: scramble button, all grid sizes. Checks that scramble
// (a) doesn't crash / no console errors, (b) actually leaves the cube in
// a NOT-solved state (a legitimate scramble shouldn't have a
// non-negligible chance of landing back on solved), (c) works repeatedly
// (scramble -> scramble again without resetting first).
import { chromium } from "playwright";

const SIZES = ["2×2", "3×3", "4×4", "5×5"];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = [];

for (const label of SIZES) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto("http://localhost:5173/");
  await page.waitForTimeout(1000);
  await page.getByText(label, { exact: true }).click();
  await page.waitForTimeout(600);

  // Scramble 3 times in a row (no reset between) to check repeated use.
  for (let i = 0; i < 3; i++) {
    await page.getByText("스크램블", { exact: true }).click();
    await page.waitForTimeout(1000);
  }
  // "완성" (solved) modal should NOT be showing after a scramble.
  const solvedAfterScramble = await page.getByText("완성", { exact: false }).isVisible().catch(() => false);
  // 이동수 (move count) should have increased -- read it from the page.
  const moveCountText = await page.locator("text=이동수").locator("..").innerText().catch(() => "");

  results.push({ label, errorCount: errors.length, errors: errors.slice(0, 3), solvedAfterScramble, moveCountText: moveCountText.replace(/\s+/g, " ") });
  console.log(`${label}: errors=${errors.length} solvedAfterScramble=${solvedAfterScramble} moveCountText="${moveCountText.replace(/\s+/g, " ")}"`);
  if (errors.length) for (const e of errors.slice(0, 3)) console.log("  ERROR: " + e);
  await page.close();
}

console.log("\n=== SUMMARY ===");
const anyIssue = results.some((r) => r.errorCount > 0 || r.solvedAfterScramble);
for (const r of results) {
  const ok = r.errorCount === 0 && !r.solvedAfterScramble;
  console.log(`${r.label}: ${ok ? "PASS" : "ISSUE"}`);
}
console.log(anyIssue ? "\nRESULT: ISSUES FOUND" : "\nRESULT: ALL CLEAN");
await browser.close();
