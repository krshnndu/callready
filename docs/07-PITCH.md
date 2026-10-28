# 07. Pitch and recording script (about 80 seconds)

The brief asks for four things: the problem, a demo of the prototype, its business value, and one key limitation. This is a read-aloud script for recording the demo in Tella: the words in quotes are spoken, and the line above each one says what to show on screen. It runs about 200 words, roughly 80 seconds at a relaxed pace.

## Before you record (5 minutes)

1. **Browser.** Chrome, a fresh window, zoom 100%, about 1440 x 900. Hide the bookmarks bar. Close other tabs, so no notifications arrive mid-take.
2. **Open** https://callreadyai.vercel.app/#/load and click **Use** on *Meridian Arc Industries*, so the sample is the active company.
3. **Theme.** In the rail, choose **Light**. It reads best in a compressed video.
4. **Clean slate.** Open step 5, **Readiness report**, and press **Clear answers**.
5. **Warm the coach**, so it answers in about a second instead of 30 to 50: go to step 4, **Rehearse** (Q01 opens), press **Load a weak sample**, then **Score my answer**. Wait for the coach panel to fill. Then reload the page.
6. **Check** that https://callreadyai.vercel.app/api/health shows `"api":{"ok":true`. If it does not, the coach is offline and the app shows its rules-built ideal answer instead. That is fine on camera; say "the coach's answer" either way.
7. Start on the **Quarter** screen (step 1), scrolled to the top.

**Tella:** record each part below as its own clip, so a stumble costs one retake, not the whole take. Put the camera bubble bottom-right; the menu is on the left. Pause for a beat after each click before you speak, so the cuts are clean.

## The script

**1. The problem** (0:00 to 0:12)

*On screen: the Quarter screen, scrolled to the top. Don't click. Rest the cursor on the red margin figure.*

"Earnings day. Revenue is up fourteen percent, but margins fell, cash flow weakened, and one segment is losing money. Analysts will read last quarter's promises back to the CFO."

**2. The product and its data** (0:12 to 0:26)

*On screen: click **Load a company**. Move the cursor down the list of real companies, then rest on the sample, Meridian Arc.*

"CallReady turns a company's results and past calls into a rehearsal. This demo uses a sample company with synthetic data. Upload any results PDF and it works the same, with every figure checked against the document."

**3. What investors will ask** (0:26 to 0:41)

*On screen: click **Pressure map**. Hover over the red marker on the margin bar, then scroll to the first two ranked items.*

"First, what investors will push on, ranked by plain arithmetic. To meet its guidance, this company needs a fifteen point three percent margin. Its best quarter ever was fourteen point two. Two earlier promises are already broken."

**4. The rehearsal** (0:41 to 0:54)

*On screen: click **Rehearse**, then **Load a weak sample**, then **Score my answer**. Scroll to the red marks, then to the coach's answer.*

"Then the CFO practises. This answer quotes a number that isn't in the results, and makes a new promise on the spot. Red. The coach suggests a stronger answer, using only verified figures."

**5. The recommendation and the value** (0:54 to 1:07)

*On screen: click **Readiness report**, then **Load demo rehearsal**. Hover over the first recommendation, then scroll to **Business case**.*

"The result is a readiness report with a clear recommendation: decide on the margin guidance before the call, not during it. On our stated assumptions, that saves about fifty hours of preparation a quarter."

**6. The one key limitation** (1:07 to 1:20)

*On screen: click **Load a company**. Scroll to the notice under **Convert and check** that begins "Only upload published documents", and rest the cursor on it (in Tella, zoom in). Look at the camera for the last sentence.*

"Our one key limitation is data trust. Teams rehearse before results are public, and our AI still runs on outside providers. Until it runs inside the company's own cloud, compliance won't sign off."

**Length:** about 200 words, roughly 80 seconds of speech, leaving about 10 seconds for clicks inside the 90-second limit. If a take runs long, drop "then scroll to the first two ranked items" from part 3's actions, or "and one segment is losing money" from part 1.

## How the script meets the assignment

| Requirement | Where |
| --- | --- |
| Explain the problem | Part 1: revenue up, margins and cash down, a segment losing money, promises read back |
| Working prototype, sample inputs to a business recommendation | Parts 2 to 5: sample company, pressure map, rehearsal and score, readiness report with its recommendation |
| Compare with earlier commitments | Part 3: two earlier promises already broken; part 4: the new promise made on the spot |
| Public or synthetic data, assumptions stated | Part 2: "sample company with synthetic data"; part 5: "on our stated assumptions" (editable on the Business case panel) |
| Business value | Part 5: fifty hours of preparation a quarter |
| One key limitation | Part 6: data trust |
| Tools | Rules plus AI, in the README; part 2 says figures are checked against the document and part 4 that the coach uses only verified figures |

## If something goes wrong on camera

- **The coach is slow.** Keep talking: the scorecard is instant because it is rules in the browser. If the coach has not answered in time, the rules-built ideal answer is already on screen.
- **Wrong company on screen.** Click the company card in the rail, **Change company**, then **Use** on Meridian Arc.

## Questions a judge may ask about the limitation

- **"Is it really that serious?"** Yes, for the user who matters most. A finance team rehearses in the days before results are announced, when the figures are unpublished and price-sensitive. Sending them to an outside AI provider is exactly what a listed company's compliance team will not allow. The app says so itself: the upload screen asks for published documents only.
- **"What still works without the AI?"** Most of it. Reading the results tables, every figure check, the pressure ranking, the question bank, the scorecard and the charts are rules running in the browser; nothing is sent anywhere to compute them. The AI is used only to convert documents the rules cannot read and for the coach, on request.
- **"How would you fix it?"** Run the models inside the company's own cloud account under its own contracts, or switch the AI off: the rules-only path already works end to end.

## Assumptions to say aloud if asked

- The sample company is synthetic. The six test companies are real public filings.
- "Fifty hours" comes from the editable assumptions on the Report screen. Say "we estimate" or "on our stated assumptions".
- Scores rank answers against a rubric. They do not predict the share price.
