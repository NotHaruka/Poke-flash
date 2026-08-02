You are doing a full visual design rework of an existing web app called FlashTrainer (a Pokémon-themed flashcard/spaced-repetition study app). The app works well functionally — this is a pure design pass, not a feature or logic change.

## Why this rework is happening

The current UI looks AI-generated, and it's not a vague feeling — it matches a specific, well-known pattern almost exactly:
- Background: warm cream (`--cream: #FAF7F2`, `--cream2: #F2EDE4`)
- Accent: terracotta/clay (`--terra: #C4613A`)
- Display font: Fraunces (a serif) paired with Plus Jakarta Sans for body text
- 8px border-radius on everything, generic card-with-shadow components throughout

This is one of the most common default outputs an LLM reaches for when no strong art direction is given — cream background + terracotta accent + high-contrast serif display. It's not bad on its own, but it reads as a template rather than a considered choice, precisely because it shows up by default regardless of the subject. Your job is to replace it with something that actually feels designed for a Pokémon-themed study tool, not for a generic SaaS landing page.

Also present, and worth fixing while you're in here: inconsistent responsive breakpoints, heavy `!important` overuse, and large duplicated inline `style="..."` blocks in the HTML. Don't take my word for any of this — read the actual files yourself:

- `responsive-audit.md` in the repo root — a prior audit with specific findings and line numbers. Treat it as a lead, not ground truth: the codebase has changed significantly since it was written (a large commit added ~20 new mini-games), so re-verify each finding against the current file before acting on it. Some line numbers will be stale or the issue may already be fixed.
- `www/index.html` and `src/styles/global.css` directly — this is the real source of truth for current breakpoints, `!important` usage, and duplicated inline styles.

## What NOT to touch

Do not modify anything under:
- `src/game/` and `src/game.ts` (Blade Bedlam's Phaser engine)
- `src/games/` — every file in here (Minesweeper, Chess, Sudoku, Rhythm, Void Survivor, etc.) is game *logic and canvas rendering*. Do not change gameplay code, canvas drawing code, or game state management.
- Anything inside `src/core/`, `src/entities/`, `src/managers/`, `src/scenes/` (Blade Bedlam internals)

You CAN and SHOULD restyle the chrome *around* games — panel headers, the games library/grid screen, buttons that aren't drawn on a `<canvas>`, modals, nav — as long as you don't touch gameplay logic or canvas-drawn UI inside a game plugin's `render()`/`draw()` methods. If a change would require editing a file under `src/games/*/`, stop and flag it instead of doing it, unless it's purely a shared style hook (e.g. a class name on a wrapping `<div>` that already exists) rather than game logic.

Everything else is fair game: `www/index.html` (the single-page app shell — sidebar, all non-game panels, panel headers), `src/styles/global.css` (the main stylesheet), and any purely presentational logic in files like `sidebar.ts`, `study.ts`, `library.ts` that builds DOM/HTML (not game files).

## Process — do this in order, don't skip to code

**1. Audit first.** Read `www/index.html`, `src/styles/global.css`, and `responsive-audit.md` before changing anything. Confirm which findings in the audit still hold (re-check line numbers/claims against the current code — the audit predates a large recent commit). Note the current design tokens (`:root` and `.dark` CSS variables) and existing component patterns (`.btn`, `.panel`, `.panel-header`, card components) so you're extending a system, not fighting it.

**2. Design brief — pin down a real point of view.** This is a Pokémon-themed flashcard app for people studying/memorizing things (decks, spaced repetition, notes, quizzes, a small arcade of mini-games as a study break). Before touching code, write out:
   - **Color** — 4-6 named hex values, chosen for this subject, not defaults. Avoid cream+terracotta and avoid the other two common AI defaults too: near-black with a single neon accent, or a broadsheet/newspaper hairline-rule look. Pick something with an actual point of view — could lean into the Pokédex/trainer-app aesthetic, could go a completely different direction — your call, but justify it.
   - **Type** — a display face and a body face, chosen deliberately for this brief, not "whatever LLMs default to" (Fraunces, Playfair, and similar high-contrast serifs paired with a geometric sans are extremely overused right now — if you reach for one of these, have a specific reason).
   - **Layout/component language** — border-radius scale, spacing scale, shadow/elevation approach, how cards/buttons/panels are differentiated from each other.
   - **One signature element** — something distinctive this app will be visually remembered by. Keep everything else disciplined around it.

   Then critique your own plan: if any part of it is what you'd produce for literally any generic study/productivity app brief, revise it until it's specific to *this* app.

**3. Consolidate the technical debt while implementing:**
   - Replace the scattered ad hoc breakpoints with a small, consistent set (e.g. one for tablet, one for mobile) reused everywhere, instead of one-off max-widths per component.
   - Remove `!important` by fixing selector specificity properly instead of overriding it — audit which rules currently need `!important` and restructure so they don't.
   - Pull the large duplicated inline `style="..."` blocks in `www/index.html` (especially the game panel headers, which currently repeat nearly identical inline styles across the Cyberflap/Void Survivor/Recall Rhythm/generic game panels) into shared CSS classes.

**4. Keep it working.** Don't rename any `id` or class that other TypeScript files reference via `getElementById`/`querySelector` — grep for a name before renaming it, and if you do rename something, update every reference. Preserve dark mode (there's a `.dark` class-based theme toggle — keep both themes working and both still deliberately designed, not just an inverted palette). Preserve mobile responsiveness — don't regress any of the mobile fixes already in place.

**5. Show your work before a full pass.** Start with the token/design plan and one or two representative screens (e.g. the sidebar + dashboard, and one panel header) so I can confirm direction before you propagate it everywhere.

## Deliverable format

First reply with the design plan (colors as named hex values with rationale, type choices with rationale, layout/component language, the one signature element) and a short critique of your own plan against the "generic AI app" pattern. Wait for my go-ahead, then implement.