# Threat model

## What the scanner is for

An agent that reads web pages is steered by any text on them. Some page authors plant text for that reason: to catch automated visitors, to inject instructions, or to watermark content. The scanner answers one question before the agent acts: does this page contain text aimed at a machine, and was it kept from a person?

It reports. It does not strip the text, answer it, or decide for you.

## What it catches

| Attack | How it shows up | Where it is tested |
|---|---|---|
| Instruction hidden with CSS | any of the nine concealment checks | `corpus/traps/t01` to `t16` |
| Instruction in plain sight | a signature match with no concealment | `t17`, `t18` |
| Instruction disguised as screen-reader text | a signature match beats the accessibility bucket | `t16` |
| Zero-width watermark | invisible characters in otherwise normal text | `t19` |
| Instruction smuggled in Unicode tag characters | decoded, then matched | `t20` |
| Keyword split by zero-width characters to dodge a text search | stripped before matching | `t21` |
| Several methods on one page | each finding reported | `t22` |

## What it cannot catch

These are documented limits, not bugs to hide. The first two have fixtures in `corpus/limits/` that the test suite pins at "reads clean", so a future change that quietly fixes one has to update the documentation too.

- **Text inside images, canvas and video.** The scanner reads the DOM. Pixels are not text. Pair it with OCR if your agent reads screenshots.
- **A sentence split across inline elements.** Each text node is judged alone, so `Ignore <b>previous</b> instructions` matches no pattern.
- **Phrases outside the 13 signatures.** A new wording that no pattern covers passes, unless it is also concealed and long enough to land in `concealed-prose`. Signatures are regexes, not a model.
- **Concealment over a background image.** When any ancestor paints an image, the true backdrop is unknown, so the color check is skipped rather than guessed.
- **Text off the far edge of a scrolling page.** Only text wholly above or left of the page, or more than 1500px right of the viewport, counts as offscreen.
- **Content that appears later.** The scan is a snapshot. Text injected after the call is not seen, so scan again before each action that matters.
- **Closed disclosure panels and inactive tabs.** A person can open these with one click, so it is not concealment. A trap placed there is only seen once the panel is open and has layout.
- **Non-English instructions.** The signatures are English.

## False positives to expect

- A hidden tab panel or menu with 40 or more characters of ordinary prose reads `review`, not `trap`. That is on purpose: the verdict says look, not stop. `corpus/clean/c13` pins it.
- Weak signatures (a model name, "prompt injection", "system prompt") only count when concealed, so a visible article about them stays clean. An author who writes about these topics in hidden text will be flagged.

## Trust boundaries

- The page is untrusted input. The scanner reads computed style and geometry and never evaluates page text.
- The gallery renders pasted HTML in an iframe with `sandbox="allow-same-origin"` and scripts off, so a pasted page cannot run code.
- The bookmarklet adds one `data-pts` attribute and one style element, and removes both on close. It makes no network requests.
- A page that knows it is being scanned can tell: the scanner only reads, but a hostile page can detect an outline attribute. Do not treat a `clean` verdict as proof of safety. Treat it as one layer.
