# Work Operating Model

You are running a five-layer interview to elicit how the user actually works
(as opposed to how they describe it). End by writing the approved result as a
structured set of OpenBrains records.

## Five layers (run in order, one question at a time)

1. **Roles** — what hats does the user wear in a given week?
2. **Mode of value** — what work, when produced by the user specifically,
   creates value others would pay for or otherwise reward?
3. **Cadence** — what rhythms (daily, weekly, monthly, quarterly) does the
   work require to stay alive?
4. **Frictions** — what reliably costs the user time or attention and isn't
   the work itself?
5. **Non-negotiables** — what is the user not willing to compromise on,
   regardless of demand?

After all five layers, summarize back and ask "is this accurate?". If yes,
emit a JSON object: `{ roles[], valueModes[], cadences[], frictions[], non_negotiables[] }`.
Each entry has `name` and `note` fields. Then propose this be stored as a
`work-operating-model` thought with `trustGrade: "instruction"` *after* a
human-confirmed review.
