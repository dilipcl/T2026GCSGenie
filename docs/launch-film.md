# "Two Years" — the launch film

A ~2:55 film to show Tejas and Mum in one sitting, before the app is handed over.

It has one job: make the next twenty-one months feel real *without* making them feel like a
sentence, and only then show the tool. Nothing about the app appears until 1:28. If the first
ninety seconds don't land, no feature list will save it.

---

## Before you generate anything: read this

**Do not let an AI video tool draw the app.** Veo, Sora, Kling and the rest cannot render your
actual UI — they produce a plausible-looking dashboard that says nothing real, and a fourteen year
old spots the fake instantly. It is the fastest way to lose him.

So the film is built in two materials:

| Scenes | Material | How |
| :--- | :--- | :--- |
| 1–11, 21–22 | **AI-generated** | Veo 3 in Google AI Studio / Flow — 8-second clips |
| 12–20 | **Real screen recordings** | Record the actual app on a phone, then cut to it |

Act 3 is stronger as real footage anyway. The point of those forty seconds is *this exists and it
is yours*, and nothing sells that like his own name on the screen.

**The 8-second rule.** Veo 3 generates 8 seconds at a time. Every scene below is written to 8
seconds — roughly 20–24 spoken words. Do not try to prompt a 20-second shot; you get one clip and
no control.

**Character consistency is the other trap.** The same boy will not survive across 14 clips — face,
hair and clothes drift every generation. The scenes are deliberately written so you rarely need his
face: backs of heads, hands, silhouettes, feet, over-the-shoulder. Where a face is needed, use
Flow's reference-image ("ingredients") feature with one photo, and accept that two or three shots
will still miss. Cut those.

**Record the voiceover separately.** Veo's native audio will not hold a consistent narrator across
22 clips. Record all the narration in one take (or one ElevenLabs session), lay it on a timeline,
then drop the silent clips underneath. This also lets you stretch or trim a shot to fit the line.

---

## The visual spine

The film is colour-graded **red, amber, green** — the app's own language, used emotionally before
it is ever used literally.

- **Act 1** — cold, desaturated, blue-grey with amber sodium light. Something is slightly wrong.
- **Act 2** — warmer, contrastier. Movement, breath, effort.
- **Act 3** — indigo and deep slate, the app's palette, with emerald accents.
- **Act 4** — full daylight. Warm. Resolved.

So when the RAG dots appear at scene 14, they *mean* something. The audience has been reading that
colour for ninety seconds without knowing it.

**Style suffix — append to every AI prompt:**

> Shot on 35mm anamorphic, shallow depth of field, natural volumetric light, fine film grain,
> muted cinematic colour grade, no text, no captions, no on-screen writing, no logos.

The "no text" matters. Generative video renders gibberish lettering and it looks cheap. All
on-screen text goes on in the edit.

---

## ACT 1 — Where he actually stands
*0:00–0:48 · scenes 1–6 · cold, blue-grey, quiet*

### Scene 1 · 0:00
**Prompt:** Slow forward dolly down the centre aisle of a vast empty British school exam hall at
dawn. Hundreds of identical wooden desks in perfect rows. Dust suspended in cold blue light from
tall windows. Completely empty of people. Deep silence.

**VO:** "In less than two years, you'll walk into a room like this one."

**On screen:** `Summer 2027` (lower third, thin type, fades in at 0:04)

**Audio:** Room tone only. No music yet.

---

### Scene 2 · 0:08
**Prompt:** Static macro shot of a single exam desk. One blank answer booklet, one black pen laid
parallel. Shallow focus, the rows behind melting to soft grey. A shaft of light crosses the paper.

**VO:** "Nobody in that room will ask how clever you are. The paper only knows what you practised."

**Audio:** A single low piano note lands under "practised."

---

### Scene 3 · 0:16
**Prompt:** Handheld tracking shot behind a fourteen-year-old boy in school uniform walking down a
busy secondary school corridor. Other students blur past in motion. He is the only sharp thing in
frame. Shot from behind, face never visible. Overhead fluorescent light.

**VO:** "Year 10 doesn't feel like it matters. Nothing decides on any single day. That's the trap."

**On screen:** `Year 10` (top left, small)

---

### Scene 4 · 0:24
**Prompt:** Fast montage, four one-second static shots: a school planner still zipped inside a bag
on a bedroom floor; a phone screen glowing on a face at 11:40pm in a dark room; a textbook page with
one corner folded over; a bedroom light going off with the desk still covered.

**VO:** "It's never one bad day. It's twelve small ones nobody noticed, stacked on top of each
other."

**Audio:** Music enters — sparse, ticking, low pulse.

---

### Scene 5 · 0:32
**Prompt:** Extreme close-up, macro. Thin sheets of paper being added one at a time to a growing
stack on a wooden shelf. The shelf bows almost imperceptibly under the weight. Slow motion, side
light, dust motes.

**VO:** "The gap doesn't open suddenly. It drifts. And it stays invisible right up until it isn't."

---

### Scene 6 · 0:40
**Prompt:** Wide symmetrical shot down a long corridor lined with identical doors, each glowing
warm green from within. As the camera slowly pushes forward, doors on both sides go dark one by one.
Volumetric haze. Architectural, dreamlike.

**VO:** "Grades don't decide who you are. They decide how many doors are still open when you finally
want one."

**On screen:** `Further Maths · Physics · Computer Science` (fades in, then out)

---

## ACT 2 — What makes it and what breaks it
*0:48–1:28 · scenes 7–11 · warmer, harder contrast*

### Scene 7 · 0:48
**Prompt:** Split-screen diptych. Left: a desk lamp, a timer, a hand writing steadily, calm and
warm. Right: the same desk at 1am, phone face-up glowing, a mug gone cold, papers scattered, the
figure slumped. Both static, locked off.

**VO:** "Here's what actually separates people. Not hours. Repetition you can keep doing."

**On screen:** `Consistency > intensity`

---

### Scene 8 · 0:56
**Prompt:** Extreme slow-motion macro of a drumstick striking a snare drum. The head ripples, dust
lifts off the skin. Warm rim light against a dark rehearsal room. Perfectly in time, hypnotic.

**VO:** "You already know this from drums. Nobody gets tight by practising once, for six hours."

**Audio:** The music's pulse syncs to the stick hits.

---

### Scene 9 · 1:04
**Prompt:** Silhouettes of air cadets marching in formation on a parade square at dusk. Breath
visible in cold air. Strong backlight from low floodlights, long shadows across wet tarmac. Faces
not visible.

**VO:** "But there's a second trap, and it's the opposite one. Saying yes to everything, until
nothing gets done properly."

---

### Scene 10 · 1:12
**Prompt:** Overhead top-down shot of a kitchen table. A paper wall-calendar entirely covered in
overlapping handwritten commitments, a school bag, a drum practice pad, a cadet beret, an unopened
letter. A pair of hands enters frame and presses flat against the calendar.

**VO:** "Cadets, drums, D of E, nine subjects, friends, sleep. That's not too much to want. It's too
much to carry blind."

---

### Scene 11 · 1:20
**Prompt:** Handheld golden-hour shot of teenagers laughing in a park, running, one throwing a
football. Lens flare, warm haze, shot from behind and at a distance so no face is readable. Joyful,
unposed, alive.

**VO:** "So none of this is about giving things up. It's about knowing what fits — before the week
decides for you."

**Audio:** Music opens up, first warm chord.

---

## ACT 3 — The tool
*1:28–2:32 · scenes 12–20 · **real screen recordings** except 12*

> Record these on the actual phone, in portrait, then place the recording inside a phone frame on a
> dark background. Do the reset **first** so the numbers on screen are the real starting ones — a
> demo full of test data undoes the whole point of the film.

### Scene 12 · 1:28 — *AI generated*
**Prompt:** A phone lying face-up on a dark wooden desk in an unlit bedroom. The screen ignites,
casting deep indigo light up across the desk, a pencil, a glass of water. Slow push-in. Nothing else
in the room is lit.

**VO:** "Which is the entire reason this thing exists."

**On screen:** `GCSE Genie`

---

### Scene 13 · 1:36 — *screen recording: Dashboard*
**Action:** Open the app on Today. Scroll slowly once through the dashboard.

**VO:** "It opens on today. What's due, what's next, and how the week is genuinely going. One
picture, not a wall of tasks."

---

### Scene 14 · 1:44 — *screen recording: subject RAG*
**Action:** Show the subject cards with their red / amber / green status. Tap into one.

**VO:** "Every subject carries a colour. Green, amber, red. It isn't a verdict — it's a warning
early enough to still act on."

---

### Scene 15 · 1:52 — *screen recording: goal consultation*
**Action:** Open a draft goal. Show the SMART fields being typed. Show the parent lock button.

**VO:** "Goals aren't handed to you. You write them, you say what the hours cost, and they only lock
once you've both agreed."

**On screen:** `Yours to argue with`

---

### Scene 16 · 2:00 — *screen recording: goal hours meter*
**Action:** Show a locked goal's weekly hours meter, part-filled.

**VO:** "Then it checks. If a goal claims three and a half hours a week, by Wednesday it knows
whether it's actually getting them."

---

### Scene 17 · 2:08 — *screen recording: burnout gauge*
**Action:** Show the capacity / burnout panel with committed vs available hours.

**VO:** "And it counts everything, not just school. If the week is overloaded it says so — before it
becomes a bad Sunday night."

---

### Scene 18 · 2:16 — *screen recording: chores → rewards*
**Action:** Tick a chore. Cut to the reward shop and the XP balance.

**VO:** "Even the dull stuff counts. Bins, dishwasher, bag packed the night before. It's points, and
points buy things worth having."

---

### Scene 19 · 2:24 — *screen recording: parent portal*
**Action:** Unlock the portal, show the week summary and the change history.

**VO — this beat is for Mum, and should sound like it:** "And on our side, we can see how the week
went without asking him about it at the door. The app does the asking."

**On screen:** `Fewer arguments. Same trust.`

---

### Scene 20 · 2:32 — *AI generated*
**Prompt:** Two mugs of tea on a kitchen table beside a phone, warm evening lamp light, Sunday
quiet. Two people sitting at right angles rather than opposite each other, seen from the chest down,
relaxed. A hand gestures towards the phone.

**VO:** "Once a week, fifteen minutes. What worked, what didn't, what next week looks like. On
purpose, together."

---

## ACT 4 — Close
*2:40–2:56 · scenes 21–22 · full warm daylight*

### Scene 21 · 2:40
**Prompt:** The same vast exam hall as scene 1, now flooded with warm golden afternoon light. The
camera pulls slowly backwards down the aisle. Still empty, but no longer cold. Long shadows, dust
glowing.

**VO:** "You don't get these two years back. But you do get every single Wednesday inside them."

---

### Scene 22 · 2:48
**Prompt:** A teenager closes a laptop, picks up a pair of drumsticks from the desk, and walks out
of frame towards a bright doorway. Backlit, shot from behind, warm daylight blowing out the door.
The room is left tidy and quiet.

**VO:** "So do the small thing today. Then go and have your life."

**On screen:** `GCSE Genie` → `Start where you are.`

**Audio:** Music resolves. Cut to black on the last word, not after it.

---

## The 60-second cut

If attention is the constraint — and with a fourteen year old it is — this is the version to show
first. Same footage, seven scenes.

| # | From | Line |
| :--- | :--- | :--- |
| 1 | Scene 1 | "In less than two years, you'll walk into a room like this one." |
| 2 | Scene 5 | "The gap doesn't open suddenly. It drifts. And it stays invisible until it isn't." |
| 3 | Scene 6 | "Grades decide how many doors are still open when you finally want one." |
| 4 | Scene 10 | "Cadets, drums, D of E, nine subjects, friends, sleep. Not too much to want — too much to carry blind." |
| 5 | Scene 13 | "So it opens on today. One picture, not a wall of tasks." |
| 6 | Scene 15 | "Goals aren't handed to you. You write them. They lock once you've both agreed." |
| 7 | Scene 22 | "Do the small thing today. Then go and have your life." |

---

## Narration notes

Read it **flat**. The single biggest risk in this film is a motivational-video voice — the swelling,
sincere, TED-talk delivery. A fourteen year old has an extremely good detector for being sold to,
and the moment it trips, everything after it is noise.

So: level tone, slightly under-energised, no rising inflection on the last word of a line. Trust
the pictures. The lines are written to be undersold.

Two lines carry the film and both should be the quietest, not the loudest:

- "It's never one bad day. It's twelve small ones nobody noticed."
- "Then go and have your life."

Whoever reads it should not be a stranger. Dad's voice, recorded on a phone in a quiet room, will
beat a perfect synthetic narrator — because the film is not a product launch, it is one person
saying something to another.

---

## Production checklist

- [ ] Run the handover reset (Parent Portal → Prepare for launch) **before** recording Act 3
- [ ] Record narration in one take, all 22 lines, then split on the timeline
- [ ] Generate Act 1, 2 and 4 in Veo — expect 3–4 attempts per shot, keep the best
- [ ] Screen-record Act 3 on the real phone, portrait, then frame it on dark slate
- [ ] Colour-grade cold → warm across the film; keep Act 3 in the app's indigo
- [ ] Add on-screen text in the edit, never in the prompt
- [ ] Music: one sparse ticking pulse for Acts 1–2, one warm sustained pad from scene 11
- [ ] Cut to black on the final word
