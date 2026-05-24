---
name: code-review
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git blame:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git ls-files:*)
description: Code review the uncommitted changes in the working tree
disable-model-invocation: false
---

Provide a code review for the uncommitted changes (staged and unstaged) in the working tree.

To do this, follow these steps precisely:

1. Use a Haiku agent to run `git status` and `git diff HEAD` and decide whether a review is warranted. Skip if any of these is true: (a) there are no changes, (b) the change is purely cosmetic (whitespace, formatting), (c) it's an automated change (lockfile bump only, generated file), or (d) it's trivial (a one-line typo fix). If skipping, tell the user why and stop.
2. Use a Haiku agent to give you a list of file paths to (but not the contents of) any relevant CLAUDE.md files: the root CLAUDE.md (if one exists) and any CLAUDE.md files in the directories whose files were modified.
3. Use a Haiku agent to read the diff and return a concise summary of the change.
4. Launch 6 parallel Sonnet agents to independently review the change. Each agent returns a list of issues and the reason each issue was flagged (CLAUDE.md adherence, bug, historical context, missing stage, etc.):
   a. Agent #1: Audit the changes for compliance with the relevant CLAUDE.md files. Note that CLAUDE.md is guidance for Claude as it writes code, so not all instructions will be applicable during review.
   b. Agent #2: Read the file changes and shallow-scan for obvious bugs. Stay inside the changes; focus on large bugs and avoid small issues and nitpicks. Ignore likely false positives.
   c. Agent #3: Read `git blame` and `git log -p` on the modified lines to identify bugs in light of historical context — e.g., the change silently reverts a prior fix.
   d. Agent #4: Read recent commits that touched these files (`git log --oneline -n 30 -- <files>`) and any in-tree notes (TODO, FIXME, NOTE) near the modified lines. Check whether prior guidance applies to the current change.
   e. Agent #5: Read code comments in the modified files and ensure the change complies with any guidance in the comments.
   f. Agent #6: **Language-stage synchronization** — see the "Stage map" section below. Confirm the diff updates every stage the change implicates: grammar, generated artefacts, AST shapes, adapter, body emitter / lowerings, inference + types, LSP surface, codegen, highlights, specs, examples, and the runtime test driver. Flag every stage that is silently absent.
5. For each issue found in step 4, launch a parallel Haiku agent that takes the diff, the issue description, and the list of CLAUDE.md files (from step 2), and returns a confidence score from 0-100. For issues flagged due to CLAUDE.md, the agent must double-check that the CLAUDE.md actually calls out that issue specifically. The scale (give this rubric to the agent verbatim):
   a. 0: Not confident at all. False positive that doesn't stand up to light scrutiny, or a pre-existing issue.
   b. 25: Somewhat confident. Might be real, may also be a false positive. The agent couldn't verify it. If stylistic, it wasn't explicitly called out in the relevant CLAUDE.md.
   c. 50: Moderately confident. Verified as a real issue, but possibly a nitpick or rare in practice. Relative to the rest of the change, not very important.
   d. 75: Highly confident. Double-checked and very likely a real issue that will be hit in practice. The existing approach is insufficient. The issue is important and will directly impact functionality, or it is directly mentioned in the relevant CLAUDE.md.
   e. 100: Absolutely certain. Confirmed real and will happen frequently in practice. Evidence directly confirms it.
6. Filter out any issues with a score less than 80. If no issues remain, report "No issues found" and stop.
7. Print the review to the user as markdown using the format below. Be brief. Cite each issue with a local path:line reference. No emojis.

## Stage map (for Agent #6)

neoc is a compiler with several stages that must stay in sync. When a change touches one stage, the related stages typically need to move together. Agent #6 reads the diff, identifies which stages the change implicates, and flags every stage that is silently absent.

The stages, in pipeline order:

| Stage | Authoritative path(s) |
| --- | --- |
| 1. Grammar | `zed/tree-sitter-neoc/grammar.js` |
| 2. Generated parser + WASM | `zed/tree-sitter-neoc/src/parser.c`, `src/grammar.json`, `src/node-types.json`, `tree-sitter-neoc.wasm` |
| 3. Typed AST shapes | `src/neoc/ast/nodes.generated.ts` |
| 4. Parser adapter (CST → Module) | `src/neoc/parser/adapter.ts` |
| 5. Body emitter + lowerings | `src/neoc/parser/lower-body.ts`, `src/neoc/parser/lower-{block,match,range,try}.ts` |
| 6. Type IR + inference | `src/neoc/types/{type,env,infer,walk}.ts` |
| 7. LSP surface | `src/neoc/lsp.ts` (hover, inlay, diagnostics, symbol kinds) |
| 8. Codegen entry | `src/neoc/codegen/lua/index.ts` |
| 9. Editor highlights | `zed/tree-sitter-neoc/queries/highlights.scm` |
| 10. Specs / reference | `specs/*.md`, especially `specs/roadmap.md` |
| 11. Examples corpus | `examples/features/<n>-<feature>.neoc` + sibling `.lua`, `.test.ts`, `__snapshots__/<feature>.test.ts.snap` |
| 12. Runtime test driver | `examples/features/run-tests.lua` |

Trigger rules — flag a stage as missing whenever the corresponding trigger fires:

- **Grammar production added or modified** (stage 1) → expect stages 2, 3, 9, 10 updated; stages 5, 6, 7 if the production participates in bodies or carries new node kinds the rest of the pipeline must handle.
- **New AST node kind appearing in `nodes.generated.ts`** (stage 3) → expect explicit handling in stages 5, 6, 7, 8.
- **New body-position statement or expression** (stages 1+3+5) → expect a sibling spec file under `specs/` and a worked example under `examples/features/` (`.neoc` + `.lua` + `.test.ts` + snapshot + `run-tests.lua` block).
- **New reserved keyword or punctuation** (stage 1) → expect highlights query (`queries/highlights.scm`) updated.
- **Language-identity change** (e.g., the `roadmap.md` "Identity" section, or removing/replacing a foundational construct) → expect `specs/roadmap.md` "Implemented today" table updated and any contradicted feature specs revised.
- **New Lua lowering shape** (stage 5 or 8) → expect a runtime assertion in `examples/features/run-tests.lua` proving the lowering actually runs under real Lua.
- **`ext fn` or runtime-binding mechanism change** → expect `specs/` to describe the binding surface; if the example corpus stopped using a Lua intrinsic in favour of an `ext fn`, every example previously relying on the intrinsic must declare it.
- **New diagnostic class** (stage 6 or 7) → expect a unit test under `src/neoc/types/*.test.ts` or `src/neoc/lsp.test.ts` and, where the diagnostic is user-visible, a spec line under the relevant `specs/<feature>.md`.

What Agent #6 specifically MUST NOT flag:

- Pure refactors that don't change the user-facing surface.
- Internal renames that don't touch grammar, AST, or specs.
- Bug fixes inside a single stage where no other stage is affected (e.g., correcting an off-by-one inside `lower-body.ts` doesn't require a spec update — only behaviour-changing additions do).
- A regenerated WASM or parser.c without grammar.js changes (that's just `setup-grammar.sh` housekeeping).

Output shape from Agent #6: for each implicated change, list the stages that should have moved and the ones that didn't. Cite the specific trigger ("grammar.js added `for_statement` but `specs/loops.md` is absent and `roadmap.md` 'Implemented today' table doesn't list it").

## Examples of false positives (for all reviewer agents)

- Pre-existing issues unrelated to the change.
- Something that looks like a bug but isn't.
- Pedantic nitpicks a senior engineer wouldn't call out.
- Issues a linter, typechecker, or compiler would catch (missing imports, type errors, formatting). Assume CI covers these.
- General code-quality complaints (test coverage, security posture, doc completeness) unless explicitly required in CLAUDE.md or by Agent #6's stage-map triggers.
- Issues called out in CLAUDE.md but explicitly silenced in the code (lint ignore comments, eslint-disable, etc.).
- Functional changes that are likely intentional or directly related to the broader change.
- Real issues that sit on lines the change did not modify.

Notes:

- Do not run build, test, or typecheck commands. Assume CI covers them.
- Read file contents via the Read tool. Use the Bash tool only for the read-only git commands listed in `allowed-tools`.
- Make a todo list first.
- Cite every bug with a path:line reference. Use the local-path format (e.g., `src/foo/bar.ts:L12-L18`) — no remote URLs needed.
- Provide at least one line of context before and after the cited line when choosing the range.

Final output format

If issues were found (example assumes 3):

---

### Code review

Found 3 issues:

1. <brief description of bug> (CLAUDE.md says "<...>")

`path/to/file.ts:L12-L18`

2. <brief description of bug> (some/nested/CLAUDE.md says "<...>")

`path/to/other.ts:L40-L46`

3. <brief description of bug> (bug due to `<file and code snippet>`)

`path/to/third.ts:L88-L92`

---

If no issues passed the filter:

---

### Code review

No issues found. Checked for bugs, CLAUDE.md compliance, historical context, and language-stage synchronization.

---
