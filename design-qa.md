# Record Image Design QA

**Findings**

- No actionable P0, P1, or P2 findings remain after the final comparison and stress pass.
- [P3] Sparse pools leave deliberate breathing room after the final result card. This keeps every result card at a readable fixed width and avoids stretching portraits; no functional or hierarchy issue was observed.

**Comparison target**

- Source visual truth 1: user-provided reference image 1 (`1036 x 993` pixels), used for per-result pull-count bands, semantic luck colors, portraits, and UP state.
- Source visual truth 2: user-provided reference image 2 (`1280 x 1007` pixels), used for the single-image, per-pool board and compact portrait cards.
- Browser-rendered implementation: local ignored QA capture `temp/record-previews/qa-genshin-miao.png` (`1000 x 1104` pixels).
- Additional local ignored captures: `qa-starrail-miao.png` and `qa-zzz-pass2.png` in the same preview directory.
- Full local comparison input: `temp/record-previews/design-qa-comparison-pass2.png`.
- Focused local comparison input: `temp/record-previews/design-qa-focused-pass2.png`.

**Viewport and state**

- Browser: Codex in-app browser.
- Browser viewport: `1280 x 720` CSS pixels.
- Captured element: `#container`, `1000 x 1104.65625` CSS pixels.
- Implementation capture: `1000 x 1104` pixels, device-density ratio normalized to `1:1` for the element capture.
- State: populated Genshin record view with three active pools, six high-rarity results, character and weapon images supplied by a local miao-plugin fixture, UP/off-banner badges, and collapsed empty pools.
- Final stress state: populated Star Rail view with all six pools active and the full 12-card display cap. The rendered `#container` remained exactly `1000px` wide, had no horizontal overflow, and decoded every image. Departure Warp showed its first five-star by absolute banner position, labelled the second five-star as a bonus, and hid any repeatable current-pity bar after the one-shot guarantee was consumed.
- The two references are directional designs with different source dimensions rather than an exact same-state mock. The comparison board normalizes each column to an equal maximum width and evaluates the requested hybrid composition instead of claiming pixel-identical reproduction.

**Full-view comparison evidence**

- Information architecture follows source 2: one global identity/summary header and one image containing separate pool panels.
- Result scanning follows source 1: pull counts receive the strongest visual weight, with green/blue/purple/orange/red bands and adjacent text labels.
- The implementation removes repeated UID banners and low-rarity rows, producing a denser `1000 x 1104` output while preserving pool totals, pity, averages, and visible high-rarity results.
- All three game themes retain the same component geometry while using distinct Genshin, Star Rail, and ZZZ palettes.

**Focused comparison evidence**

- Character portraits use a face-oriented crop; weapon and light-cone assets use contained scaling and remain uncropped.
- UP and off-banner badges are visually distinct and are also labelled in text, so state is not color-only.
- Names, pull counts, luck labels, and dates remain readable at the final screenshot scale. Secondary dates, pull-band labels, and source credits now use an 11px minimum; two-line clamping protects long names without changing card height.
- The focused comparison confirms that the pull-count bands preserve source 1's high-signal treatment while the portrait grid and pool grouping preserve source 2's card model.

**Required fidelity surfaces**

- Fonts and typography: Microsoft YaHei/PingFang SC/Noto Sans CJK fallbacks are consistent; the title, pool heading, summary values, and pull counts form a clear hierarchy. Key values are 14–27px, while pull-band labels, dates, credits, and other compact supporting copy remain at least 11px.
- Spacing and layout rhythm: fixed 20px outer padding, 12–14px section gaps, two pool columns, four result cards per half-width pool, and eight per full-width odd final pool. No clipping or horizontal overflow was observed at the TRSS screenshot width.
- Colors and visual tokens: each game uses a dedicated high-contrast token set. Semantic pull bands use white text on darkened green, blue, purple, orange, and red backgrounds (all at least 6.5:1); UP/off/unknown status labels retain text as well as color. Gold is reserved for high-rarity/UP emphasis rather than reused as the neutral luck state.
- Image quality and asset fidelity: the production resolver embeds validated local WebP/PNG/JPEG data from miao-plugin for Genshin and Star Rail and supports cached local ZZZ-Plugin assets for ZZZ. Missing assets use a real bundled `512 x 512` WebP, not a CSS/text/emoji substitute. The footer distinguishes all-local, partially local, all-fallback, and no-high-rarity states. All inspected images decoded successfully.
- Copy and content: labels clearly separate total pulls, high-rarity count, average/best/worst, current pity, displayed results, UP/off-banner status, and collapsed empty pools. The footer explains the 12-result limit and image source.
- Icons: the record image has no icon controls; no emoji, glyph icon, handcrafted SVG, or CSS illustration is used as an asset replacement.
- Accessibility: semantic headings/articles, image alt text, textual status labels, WCAG AA semantic color pairs, and an 11px minimum for compact supporting copy are present. This is a generated static report image, so keyboard/focus states do not apply.

**Browser verification**

- Routes tested: `/genshin.html`, `/starrail.html`, and `/zzz.html`.
- Primary interaction: static record rendering only; the artifact intentionally contains no interactive controls.
- Genshin and ZZZ each rendered three active panels and six result cards. The final Star Rail stress route rendered all six active panels and twelve result cards. Every route set `body[data-rendered="true"]`, remained `1000px` wide, and reported zero failed images.
- Genshin and Star Rail were verified with real local miao-plugin WebP assets embedded as data URLs; ZZZ and a no-miao pass were verified with the bundled fallback image.
- The ZZZ-Plugin path and catalog variants are covered by resolver tests for agent, W-Engine, and Bangboo images; the browser fallback pass deliberately represents a host without ZZZ-Plugin installed and does not claim a visual check of that optional local cache.
- Browser console warnings/errors: none.

**Comparison history**

1. Pass 1 found a P2 layout issue: with an odd number of active pools, the final panel occupied only the left column and left a large unused region on the right. Secondary result dates were also smaller than desired.
2. Fix: the odd final panel now spans both columns, keeps result cards at their compact width through an eight-column result track, and raises compact supporting copy to at least 11px.
3. Pass 2 evidence: `qa-genshin-miao.png`, `qa-starrail-miao.png`, `qa-zzz-pass2.png`, `design-qa-comparison-pass2.png`, and `design-qa-focused-pass2.png`. No actionable P0/P1/P2 differences remain.
4. Final pass deepened semantic pull colors, raised all compact supporting copy to at least 11px, corrected mixed image attribution, and exercised the six-pool/twelve-card Star Rail state without clipping or failed images.

**Open Questions**

- miao-plugin and ZZZ-Plugin resource catalogs can evolve. The resolver therefore treats both as optional, validates paths and image signatures, retries expired negative caches, and falls back without blocking the record image.

**Implementation Checklist**

- [x] One generated image with per-pool sections.
- [x] High-rarity character/weapon/light-cone/agent/W-Engine/Bangboo images when the matching local plugin cache is available.
- [x] Pool-specific pity and average/best/worst statistics.
- [x] Pull-count color bands and UP/off-banner labels.
- [x] Distinct Genshin, Star Rail, and ZZZ themes.
- [x] Missing-image, no-miao, and no-ZZZ-Plugin fallback.
- [x] Six-pool/twelve-card browser stress state and no-high-rarity DOM state.
- [x] Browser capture, console check, full comparison, and focused comparison.

**Follow-up Polish**

- P3: if future users request more than 12 visible results, add an alternate long-report mode rather than shrinking the current cards.

final result: passed
