# Record Image Design QA

**Findings**

- No actionable P0, P1, or P2 findings remain after the layout and long-history pass.
- [P3] A later page can contain only one half-width pool when one pool has more results than the others. This is intentional: keeping the same card width is more readable than stretching the final pool across the page.

**Comparison target**

- Source visual truth: `temp/record-previews/qa-genshin-miao.png` (`1000 x 1104` pixels). This is the previous production-shaped record page and shows the exact problems named by the user: warm Genshin styling, promotional copy, a full-width odd final pool, and the 12-result presentation.
- Rendered implementation: `temp/record-previews/qa-genshin-snezhnaya-page1.png` (`1000 x 1562` pixels) and `temp/record-previews/qa-genshin-snezhnaya-page2.png` (`1000 x 772` pixels).
- Combined comparison input: `temp/record-previews/design-qa-comparison-r7.png`.
- Focused comparison input: `temp/record-previews/design-qa-focused-r7.png`.
- The source and implementation use different record counts, so the comparison judges the requested layout, copy, theme, and card behavior rather than claiming pixel-identical content.

**Viewport and state**

- Browser: Codex in-app browser.
- Browser viewport: `1280 x 720` CSS pixels; visual viewport width was `1264.67` CSS pixels with a scrollbar and device pixel ratio `1.5`.
- Record canvas: fixed `1000px` CSS width with no horizontal overflow.
- Screenshot normalization: viewport slices were stitched at their reported CSS scroll positions, cropped to the `1000px` record canvas, and saved at one output pixel per CSS pixel.
- Genshin state: three active pools, 25 five-star results, local miao-plugin character and weapon images, and two generated pages. Page 1 contains 24 result cards; page 2 contains the remaining card.
- Additional states: Star Rail six-pool/12-card page (`1000 x 1527`), ZZZ three-pool/six-card page (`1000 x 1107`), and the one-card Genshin second page. `temp/record-previews/qa-starrail-r8-scaled.jpg` is a single-viewport 45% capture of the complete Star Rail canvas, used to rule out stitching artifacts in the earlier tall QA capture.

**Full-view comparison evidence**

- The old final weapon pool spans both columns. The new board uses two independent fixed-width columns; the third pool stacks below the first column and never widens.
- The old warm ivory, green, and gold structure is replaced with cold white, ice blue, navy, and silver surfaces. Luck and UP/off-banner colors remain separate semantic data colors.
- The old 12-result statement and folding behavior are absent. A 25-result fixture produces 24 cards on page 1 and one card on page 2, with explicit `1 / 2` and `2 / 2` page labels.
- The previous promotional phrases are replaced by direct labels such as `总体评价`, `卡池明细`, `频段明细`, and factual sample/average counts.

**Focused comparison evidence**

- Header hierarchy remains compact: identity on the left, four summary values in the center, and the overall rating on the right. The Genshin header now identifies the Snezhnaya theme without decorative snowflake art or gradients.
- Pool panels remain equal width. Character and weapon cards keep the same portrait size, pull-count emphasis, status badges, name area, and date treatment.
- The independent column stacks remove the large interior gap that appeared when a short left pool shared a CSS grid row with a much taller right pool.
- Page 2 keeps its single remaining pool half width and labels it `本页 1 / 全池 12`. This verifies the no-full-width rule at the sparse boundary without making full-pool statistics look like page-only values.

**Required fidelity surfaces**

- Fonts and typography: Microsoft YaHei, PingFang SC, and Noto Sans CJK fallbacks are unchanged. Titles, pool headings, pull counts, labels, and dates preserve the established hierarchy and do not clip at the final screenshot scale.
- Spacing and layout rhythm: the record stays `1000px` wide with 20px outer padding, 12–14px section gaps, two independent pool columns, four result cards per panel row, and no odd-panel span rule.
- Colors and visual tokens: Genshin uses an ice-blue/navy/silver palette with solid surfaces only. The muted token was darkened to `#4f6477` after a small-text contrast check. Semantic pull bands and UP/off/unknown labels retain text as well as color, and the overall `hard` state has its own red token.
- Image quality and asset fidelity: all Genshin and Star Rail preview images decode from the local miao-plugin fixture. Weapon images use contained scaling; character portraits use a face-oriented crop. ZZZ correctly falls back to the bundled WebP when an optional ZZZ-Plugin cache is unavailable.
- Copy and content: the interface states what is measured and how many results are present. No remaining luck-message roleplay, promotional sentence, folded-count message, or hidden-result claim appears in the inspected pages.

**Browser verification**

- Routes tested: `/genshin.html`, `/genshin-2.html`, `/starrail.html`, and `/zzz.html`.
- Every route set `body[data-rendered="true"]`, measured exactly `1000px` wide, reported `scrollWidth === 1000`, and had zero broken images.
- Result counts: Genshin `24 + 1`, Star Rail `12`, ZZZ `6`.
- Genshin page 1 height: `1561.90px`; page 2 height: `772.28px`; both remain well below the renderer's former 4000px split threshold.
- Browser console warnings/errors: none. The single-viewport scaled Star Rail capture contains each header, pool total, and date exactly once; the duplicate band seen in an earlier stitched QA image was not present in the rendered DOM.

**Comparison history**

1. Initial comparison found a P1 functional mismatch: the data service limited the whole image to 12 results and the DOM advertised older records as folded. Fix: retain every high-rarity item, paginate at 24 cards, and send pages sequentially.
2. Initial comparison found a P1 layout mismatch: the odd final pool spanned both columns. Fix: remove the odd-span/eight-card CSS and keep every pool half width.
3. First revised screenshot found a P2 rhythm issue: a normal row grid forced the third pool below the taller second pool, leaving a large interior blank region. Fix: render two independent vertical pool columns while retaining the two-column reading structure.
4. Accessibility review found the original Snezhnaya muted token below the 4.5:1 small-text target and pagination pool totals mildly ambiguous. Fix: darken muted text, raise key small labels to 12px, and add explicit per-page/full-pool counts.
5. Post-fix screenshots show the weapon pool directly beneath the left pool, all 25 results across two pages, no horizontal overflow, no failed images, factual copy, and the requested Snezhnaya palette.

**Open Questions**

- None blocking. Optional miao-plugin and ZZZ-Plugin catalogs can change independently, so missing assets continue to degrade to the bundled image without removing result cards.

**Implementation Checklist**

- [x] Fixed two-column pool panels with no odd full-width panel.
- [x] Independent column stacks to avoid an interior blank row.
- [x] All high-rarity results retained and split into bounded pages.
- [x] Sequential render/send queue with duplicate-command protection.
- [x] Histories beyond eight pages continue through an explicit in-memory next-batch cursor instead of folding or unbounded message bursts.
- [x] Queue capacity, screenshot watchdog, reply result checks, and retry cursor verified by automated tests.
- [x] View loading has a 15-second watchdog; histories above 50,000 total or 4,096 high-rarity records fail explicitly before sort/render instead of truncating or monopolizing the queue.
- [x] Snezhnaya Genshin palette with solid, restrained surfaces.
- [x] Promotional and roleplay-style copy replaced by factual labels.
- [x] Page/full-pool counts, hard-state color, and small-text contrast verified.
- [x] Genshin page 1/page 2, Star Rail, and ZZZ browser checks.
- [x] Zero overflow, broken images, or console errors.

**Follow-up Polish**

- P3: if users later prefer fewer messages over fixed card size, expose the per-page count as a configuration option rather than reintroducing folding.

final result: passed
