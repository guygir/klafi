# Kalpi — Quiz (learning-bound packs)

## What “quiz on pulled cards” means

You only get quizzed on a card **already in your binder** — usually from the last pack you ripped.

1. You open a pack. You see a face. You (should) flip the back and read who they are / which list.
2. Later (or right after), a 5-minute popup shows **that same face + name**.
3. Swipe: what do they do? Swipe: which list? Both right → **one extra pack**.
4. Wrong or timeout → no pack. Show the back again. You can try a different owned card later. One extra-pack win per day.

Why only pulled cards: you cannot farm knowledge you never saw. The rip creates the chance to learn; the quiz checks that you did. That is “progression bound to learning.”

Not an opinion poll. Not “who is good.” Options are copied from the card back.

---

## Popup UX (designed)

Timed offer, not a menu. Dismissible. Never blocks the daily rip.

```
[ illustration + name ]
what do they do / what are they known for?
  ←  swipe options  →     (1 correct)
which list?
  ←  swipe lists  →       (1 correct)
5:00  ·  both right → extra pack
```

Drawn from a card the player **owns** (prefer last pack). Options come from that card’s catalog fields (list name, list slot, or subject) — not from a survey and not from a special event.

**One extra-pack win per Israel civil day.** The server keys this on `jerusalemDay()`: the `YYYY-MM-DD` calendar date in `Asia/Jerusalem`. That is “today in Israel,” not a Jerusalem holiday and not an Events-tab event. After a win, `quizWonDay` stores that date; the button stays hidden until the date rolls over at midnight Israel time. Noted in `app/server/app.js` (`jerusalemDay`, `quizWonDay`) and in this file.

Below: item bank for the deck and for later implementation. Same rule: no “who is good.”

---

## 10 sample items (from PoC backs)

---

### 1 — Commons
**How many seats does the Knesset have?**
- A. 61
- B. 100
- C. 120
- D. 150

**Answer:** C. 120. A government still needs 61. (SYS-C-01)

---

### 2 — Commons
**What do you vote for at the kalpi?**
- A. A local district MK
- B. A closed party list
- C. A prime minister by name
- D. A yes/no referendum

**Answer:** B. Closed list. If the list wins 18 seats, the first 18 names enter. (SYS-C-02)

---

### 3 — Commons
**What is the electoral threshold?**
- A. 1% of registered voters
- B. 2% of all citizens
- C. 3.25% of valid votes
- D. 5% of ballots cast

**Answer:** C. 3.25% of valid votes, since 2015. Under-threshold votes elect nobody. (SYS-C-03)

---

### 4 — Commons
**When must lists be filed with the CEC for 2026?**
- A. 17 July 2026
- B. 9 September 2026
- C. 20 October 2026
- D. 27 October 2026

**Answer:** B. 9 September. Election day is 27 October; abroad voting starts 20 October. (SYS-C-04)

---

### 5 — Likud
**Who is reported in slot 1 on the Likud list?**
- A. Israel Katz
- B. Amir Ohana
- C. Eli Cohen
- D. Benjamin Netanyahu

**Answer:** D. Chair and current prime minister. (LIK-M-01)

---

### 6 — Democrats
**The Democrats are a merger of which two parties?**
- A. Likud and New Hope
- B. Labor and Meretz
- C. Yesh Atid and Bennett 2026
- D. Hadash and Balad

**Answer:** B. Merged in 2024; Yair Golan chairs the list. (DEM-M-01)

---

### 7 — Democrats
**Which published Democrats plank appears on DEM-P-01?**
- A. A state commission of inquiry into 7 October 2023
- B. Cancelling the electoral threshold
- C. A presidential system
- D. Ending proportional representation

**Answer:** A. (DEM-P-01)

---

### 8 — Ra'am
**In 2021, what did Ra'am do that no Arab party had done as a formal partner?**
- A. Boycott the Knesset
- B. Merge with Likud
- C. Sit in a governing coalition
- D. Run only abroad

**Answer:** C. Bennett–Lapid government. (RAM-M-01)

---

### 9 — Ra'am
**Who did Abbas announce as joining the 2026 Ra'am slate on 31 August?**
- A. Ahmad Tibi
- B. Yoav Segalovitz
- C. Gideon Sa'ar
- D. Yair Lapid

**Answer:** B. Former Yesh Atid MK; expected slot 2, first Jewish candidate on this list. (RAM-M-02)

---

### 10 — System literacy
**If a list you like is polling at 2.8%, what happens to those votes if the result holds?**
- A. They are split among similar lists
- B. They still get two seats
- C. They stay valid on the tally but elect nobody
- D. They are recounted as blank

**Answer:** C. Threshold is 3.25% of valid votes. (SYS-C-03)

---

## Writing rule for more items

- Stem from a back the player owns.
- For popups: two swipe stems only — **role/achievement** and **list**. Four-choice items above are for a longer quiz mode if we ever want one.
- No “all of the above.” No opinion.
- If a slot is still TBD, do not quiz the TBD. Quiz the rule (CEC date, threshold, closed list).

### Popup examples (same backs)

**LIK-M-01**  
Shown: illustrated Netanyahu.  
Swipe A: Prime Minister and Likud chair / Knesset Speaker / Ra'am chair / CEC head.  
Swipe B: Likud / Democrats / Ra'am / Commons.

**DEM-M-02**  
Shown: illustrated Lazimi.  
Swipe A: Slot 2 on The Democrats after the 2026 primary / Likud slot 2 / Ra'am reserved women’s slot / CEC chair.  
Swipe B: Democrats / Likud / Ra'am / Yisrael Beiteinu.

**SYS-C-03**  
Shown: threshold art.  
Swipe A: 3.25% of valid votes / 61 seats / 120 MKs / 9 September.  
Swipe B: treat as Commons (no party). Second swipe can be “what happens under the line?” → elects nobody.
