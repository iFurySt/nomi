---
name: nomi-interactive
description: Generate compact, working interactive learning blocks for Nomi notes and canvases, with portable .nomi-ui.json output and optional HTML design previews. Use when creating or revising Nomi experiments; not for ordinary prose, static diagrams, or arbitrary web apps.
---

# Nomi interactive content

Create an experiment the reader can understand by using it. Deliver a portable program, not a screenshot or a prerecorded animation. This skill is plain Markdown and local files: it does not require a specific model, account, agent API, or Nomi login.

## Before generation

Read [the capability contract](references/contract.md) and [the design standard](references/design.md). Pick the closest asset only when useful:

- `assets/bpe-compact.nomi-ui.json`: editable sentence, real single-step BPE, four coordinated data views with linked highlights and expandable rows, restart and previous step.
- `assets/wave.nomi-ui.json`: parameter exploration with sampled curves and semantic graphics.
- `assets/temperature.nomi-ui.json`: softmax exploration (legacy draft-1).
- `assets/bpe-design-preview.html`: user-approved visual reference for compactness and coordinated highlights. This is a conversational HTML fragment, not an importable program; icons/preview state use optional host helpers. Read it only when exploring the richer visual target.

Use the target app's supported profile. This package snapshots **portable draft-2, 2026-11-11**, including Table/Button/TextInput version 2; it needs the newer Nomi runtime, not the older 0.3.2 release. Read the installed application's capability information if available; do not infer support from a version number alone.

Internally identify the learning question, editable input, visible result, main action, and a few known correct results. Do not display that planning checklist inside the experiment. If the requested computation or presentation is unavailable, say exactly what is missing. Never invent a component/property/function or disguise a static diagram as an interactive result.

## Generate

Write `<subject>.nomi-ui.json` containing **one InteractiveProgram object**, without a block/commands wrapper or code fences. Use stable IDs, typed state, bounded computation and declared capabilities from the contract. No HTML, JavaScript, React, CSS, CDN URLs, network requests, file access or host effects belong in this portable file.

Make the initial state useful. Show the visual consequence of changing an input or advancing a step. Keep titles, labels and units short; omit setup prose, redundant instructions and implementation details. Prefer one primary action and compact related controls. Adapt the composition to the subject, rather than turning every experiment into a BPE table or Temperature Lab.

For revisions, preserve compatible state/node IDs and version the program. Deliver the complete revised definition, not a partial patch. Do not overwrite the user's live `.nomi` package.

## Verify

When Node is available, run the bundled offline validator (Node 22+; no install needed):

```sh
node <skill-directory>/scripts/validate.mjs <subject>.nomi-ui.json
```

It uses Nomi's actual parser and evaluator. Passing this is structural/default-state validation, not proof of teaching quality. Exercise meaningful inputs and actions with a JSON event list:

```json
[{"set":"corpus","value":"ab ab ac"},{"action":"restart"},{"action":"next"}]
```

```sh
node <skill-directory>/scripts/validate.mjs <subject>.nomi-ui.json events.json
```

The report includes final state, derived values and resolved view props. For BPE, that trace should yield one rule `a + b → ab`, frequency 2, tokens 9 → 7. Check empty input, a different sentence, completion, previous and restart. For other subjects use independent numerical/behavioral expectations. Fix errors, then re-run. If execution is unavailable, clearly label the output unvalidated; never report a test you did not run.

If a preview environment is available, inspect desktop and narrow layouts and actually operate the controls. A standalone HTML preview may explore richer styling, but is a **separate design preview**: it is not importable into Nomi and cannot silently add capabilities to the portable program. Keep preview computation consistent with the program; identify any intended renderer enhancements separately.

## Deliver and use

Return the `.nomi-ui.json` file and a short usage sentence. In Nomi: at the intended position insert **交互块 → 导入交互定义（.json）**, then choose the file. If only text can be returned, provide the complete JSON in one code block for saving with that extension.

Current limitation: pasting raw HTML or JSON into the note body does **not** create a runnable interactive block. Do not claim direct clipboard import, HTML execution, or a mobile renderer is already implemented. The JSON preserves portable semantics; each supported platform controls its own presentation.

For a conversational agent without skill auto-discovery, the user can attach this folder/archive and ask it to read `SKILL.md`, then follow the same workflow. For a CLI agent, point it to this file or install the folder using that harness's supported skill mechanism. Do not require this repository or modify global agent instructions.
