# Compact interactive learning

The accepted BPE design shows the sentence, one main action, current segmentation and candidate frequencies, then merge rules and vocabulary. The user approved its compactness and low prose density. Four tables are appropriate for BPE, not a universal template.

## Composition

- Put input → action → effect in reading order. Keep a short heading and a small live progress label.
- Use two columns only for directly comparable views; stack in the same reading order on phones. Group with spacing and quiet dividers, not nested cards and repeated large headings.
- Prefer a short live value (`词元 39 → 36`) to three metric cards. Prefer `合并 a + r` to a button plus a paragraph explaining it, when safe expressions can compute the label for every state.
- Tables need descriptive short columns, aligned numeric values and a clear next/result state. Avoid text walls and showing the same explanation above each table.
- In a richer preview, highlight the same candidate in segmentation and frequency ranking; highlight the newest rule/token after advancing. Do not use unrelated colors for every item.
- Default to compact readable rows. Long data should be expandable when the renderer supports it. Never silently drop required rows or fabricate a truncated result as the full vocabulary.
- Use icon buttons for familiar back/reset/copy actions when supported, with accessible names and focus/hover feedback. A short text button is better than an invented `icon` prop or cryptic Unicode glyph.
- Verify changed input, action results, empty/completed states, light/dark and narrow layout. Input errors must leave the control usable.

## Versioned compact presentation

Draft-2 now supports **version 2** of Table, Button and TextInput. Declare component versions in both requires and each node; other components stay version 1. See contract.md for exact properties.

- Table: visibleRows (1–20), start/end window, absolute highlightRow (-1 for none), semantic cells {tokens, emphasis, groups, joiners}, short hint, showCount, columnAlign and emptyText. Expansion preserves every data row; no fake truncated vocabulary.
- Button: primary/secondary emphasis, previous/restart icons with accessible labels, computed disabled state. Use a black primary action, neutral supporting controls, blue only for meaningful selection or linked data.
- TextInput: hideLabel retains its accessible label without visible label text; resetTargets resets dependent progress whenever the user edits its value. Use ["step"] for BPE so a new sentence starts from characters.
- Row/Panel choose responsive layout; desktop uses compact parallel tables, narrow containers stack. No arbitrary CSS, HTML/JS or per-platform pixel layout in the DSL.

The compact BPE example now provides next-merge label, token/candidate highlights, latest rule/token emphasis, full expandable tables, a single summary and reset-on-input. The HTML asset remains a design reference, not an importable file. Animation timing, arbitrary visibility and general-purpose scripted interactions are still outside this contract.

## BPE correctness

This is character-level teaching BPE, not a production tokenizer. Split input at whitespace, start with Unicode code points plus `</w>` per word, count adjacent pairs including repeated words, and merge non-overlapping occurrences left-to-right. Ties use the UTF-16 lexical order of JSON pair keys. Use the registered `learning.bpe` function rather than inventing an alternative in JSON.

Candidate frequencies answer “what merges next?”; ordered rules answer “what happened?”; the learned vocabulary retains initial and intermediate tokens even when their current frequency is zero. Use `learnedVocabulary`, not `vocabulary`, for the complete learned vocabulary. Show computed `step`, not an attempted step beyond completion. Explain boundary symbols in a concise label or tooltip where supported.

## BPE reference fidelity

Use the approved HTML as the visual baseline, not just a broad style reference. The next candidate has a flat blue row with black tokens and an arrow; adjacent tokens to merge share one blue capsule without underlines. Rules read `a + b → ab` and only the latest result chip is blue. Vocabulary uses the same result-chip emphasis. Use ▁ consistently, six visible rows, a round counter beside the title, and muted section hints. Avoid substituting five raw columns or blue rule/vocabulary rows.
