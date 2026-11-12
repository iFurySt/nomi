# Online-generated fixtures

Recorded on 2026-11-09 through Nomi(Dev)'s normal AI UI using synthetic prompts and GPT-6.1-Sol. No user document context or account information is included.

- `generated-bpe.json`: editable corpus, single-step BPE, reset, tokenization, merge rules and current vocabulary. Default corpus: `ab ab ac`.
- `generated-wave.json`: amplitude and frequency sliders, sine curve, linked Scene ball and displacement metric at x=1. This is the final result of a second conversational request setting the domain to 0..2 and sampling to 512 points.

These are model outputs, not hand-authored ideal examples. Independent behavior checks live in `../v2.test.ts`; renderer replay and screenshots in `scripts/check-interactive-v2.mjs`. Generation observations and limitations are documented in `docs/design-docs/interactive-v2-validation.md`.

Recorded on 2026-11-11: `generated-bpe-sentence.json` is the unchanged IR generated from the user's sentence / single-step / candidate frequency / rules / vocabulary request in a separate synthetic Dev note. It uses side-by-side process panels and the complete `learnedVocabulary` output. The generated default sentence is `we learn to learn and we love learning`. No document or account metadata is included.
