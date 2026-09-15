# Kalpi PoC — first test kit

Goal: determine whether the core pack creates enough comprehension and unresolved collection interest to make a player return tomorrow. Sharing is the secondary signal.

Prestige and Satire are not part of this test.

## Cohort

Use five to ten people:

- 2–3 quiet or fearful current-opposition supporters
- 2–3 undecided voters
- 1–2 voters currently supporting the opposing side
- Optional: 1 creator who regularly posts political or youth-culture content

Do not record names in product analytics. Keep recruitment/contact details outside the runtime event store.

## Tester links

Use one code per tester or cohort:

`http://127.0.0.1:4173/?ref=tester-code`

For a remote deployment, replace the origin and keep the `ref` value.

## Facilitator script

1. “This is a disclosed advocacy collectible. Use it as you normally would; I will not explain the controls.”
2. Observe whether the tester opens the pack without help.
3. Do not explain the walkout order or source link.
4. After the sixth back, ask the questions below.
5. Show Growth and Studio only after the unguided session.

## Questions

1. What line, fact, or person do you remember?
2. What did the card want you to understand?
3. Where would you check whether it was accurate?
4. What side did the game support, and was that clear early enough?
5. Would you return tomorrow? Why or why not?
6. Would you share any card? Which one, to whom, and why?
7. What felt slow, confusing, manipulative, generic, or unfinished?

## Observations to record

- Pack started without assistance.
- Empty card understood as anticipation rather than a loading failure.
- Quote/fact read before advancing.
- Party/ballot clue noticed.
- Portrait/name relationship understood.
- Full back reached for all six cards.
- Source opened.
- Advocacy sponsor/faction understood.
- Binder reached.
- Share attempted or declined with reason.
- Stated return intent.

## Runtime events

- `pack_opened`
- `back_completed`
- `binder_reached`
- `source_opened`
- `share_created`
- `referral_opened`
- `gift_preview_created`

The guided demo does not emit pack, binder, or inventory events. Use it for rehearsals, not funnel measurement.

## First diagnosis

- Pack not started: opening proposition or trust problem.
- Walkout abandoned: pacing, hierarchy, or reading-load problem.
- Back skipped mentally: payload or source presentation problem.
- Binder reached but no return intent: collection/timer promise problem.
- Return intent but no share: artifact or social-risk problem.
- Opposing-side tester spots clipped context: factual/editorial quality problem; correct before intensifying.

Fix the first broken step. Do not add Prestige, Satire, quiz, real trading, or another progression system to compensate.

## Pass signal for the next iteration

- At least 4 of 5 testers finish all six backs without instruction.
- At least 3 of 5 can repeat one card’s point and identify where its source lives.
- At least 3 of 5 say they would return tomorrow for a product reason.
- At least 1 organic share attempt or a specific, actionable explanation for why nobody shared.

These are learning thresholds for a tiny PoC, not population forecasts.
