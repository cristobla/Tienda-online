---
id: 5
title: "Built-in browser pane renders no frames between captures: stale screenshots after scroll and View Transition navigations that look stuck"
status: open
type: open-source
skill: ["anthropic-skills:built-in-browser"]
proposes_skill: []
target_file: []
siblings_checked: "browser family: built-in-browser, chrome-browser — built-in-browser only; chrome-browser assumed unaffected (the user's real Chrome paints visible tabs normally), not re-read this session"
area: "verifying UI in the browser pane (screenshots and anything waiting on requestAnimationFrame)"
date: 2026-10-18
session_context: "Redesign of a local Next.js store and then React <ViewTransition> page transitions, verified in the built-in browser pane"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: after scrolling, screenshot showed white unpainted areas while document.elementFromPoint returned the expected content; toggling a body style and waiting 2 s, then screenshotting, painted it → ok. run: a client navigation wrapped in a View Transition left the URL and DOM unchanged for 8 s; a screenshot (which forces a frame) let it finish, and a requestAnimationFrame probe resolved right after → ok"
---

**Issue:** In the built-in browser pane, the page produces no rendering frames between screenshots. Two symptoms followed. First, screenshots taken after a scroll showed large white areas although the DOM held the content, which nearly read as a layout bug. Second, a React/Next.js navigation using the View Transitions API never committed: `document.startViewTransition` waits for a frame to capture the old state, so the URL and grid stayed unchanged until a screenshot forced a frame. This nearly led to "fixing" working code.

**Suggested improvement:** In built-in-browser's verification guidance, add a rule: before trusting any screenshot or any state that depends on a rendered frame (View Transitions, requestAnimationFrame, scroll-driven animations), force a frame (take a screenshot or nudge a style, then wait), and confirm with a DOM probe (`elementFromPoint`, `location.href`). Treat a navigation that "hangs" with a View Transition pending as a pane artefact until a forced frame says otherwise. Also note that the pane may report `prefers-reduced-motion: reduce`, so animations cannot be judged visually there.

**Second instance (2026-10-19, motion pass on the same store):** about an hour went into "fixing" View Transitions that were actually fine, because of three pane conditions. (1) The store tab was in the background, and later the app window was not visible, so `document.visibilityState` was `hidden`: update callbacks waited about 750 ms for a frame, and transitions resolved with no animations or aborted with `InvalidStateError`. (2) The pane reported `prefers-reduced-motion: reduce`, so the site's own reduced-motion rule set every `::view-transition-*` to `animation: none` and transitions finished in about 12 ms. (3) Only React's own `element.animate()` calls appeared in `document.getAnimations()`, and `getComputedStyle(html, '::view-transition-group(x)')` returned `none`, so "no animations" was a measurement artefact. A real bug existed too (`update="none"` on a parent boundary makes React cancel the whole transition), but it surfaced only after the three artefacts were ruled out. Pre-flight that would have saved the hour: check `document.visibilityState === 'visible'` and `matchMedia('(prefers-reduced-motion: reduce)').matches` before any motion measurement; to test motion under an OS that disables animations, delete the reduced-motion `@media` rule in the test tab only; and judge transitions by the inline `view-transition-name` values React applies at `startViewTransition` time plus a slowed-down screenshot, not by `getAnimations()`.

**Principle:** A headless or embedded browser that paints only on demand can freeze anything that waits for a frame; verify frame-dependent behaviour with a forced frame plus a DOM-level probe before concluding the code is wrong.
