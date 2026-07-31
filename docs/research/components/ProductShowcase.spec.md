# ProductShowcase Specification

## Overview
- Target file: `apps/web/src/components/landing/ProductShowcase.tsx`
- Interaction model: static copy + muted looping product videos with play/pause buttons.

## DOM Structure
- Lead heading and paragraph.
- Three product rows: copy column and video column.

## Computed Styles
- Section max-width 1200; padding 0 75px; margin-bottom 48px.
- Lead margin 80px 0 120px; align center; heading 32px/38px 700 Legend in `#0044c9`; body max-width 568, 16px/24px 500, centered.
- Row width 1050, height 400, display flex, margin-bottom 32px.
- Copy width 420; media width 630 with 32px left padding.
- Eyebrow: 16px/24px, `#282727`.
- H4: 24px/29px 700 Legend, `#1477d1`, margin 10px 0 20px.
- Body: 16px/24px 500, `#646e80`, margin-bottom 20px.
- CTA: blue pill, 15px/21px 700, padding 7px 18px, margin 24px 0 10px.
- Video: 598px wide, approx 339px high, object-fit contain, radius 8px.
- Mobile: section padding 0 25px; lead margin 48px 0 64px; heading 24px/29px; body left aligned.
- Mobile row: flex-direction column-reverse (media first visually), margin-bottom 64px; media full width, margin-bottom 32px; copy height auto.

## Per-State Content
- 3D Design — Start designing in 3D — “If you can dream it, you can build it. From product models to printable parts, 3D design is the first step in making your ideas real.” — Explore 3D Design.
- Circuits — Power up your imagination — “From blinking your first LED to reimagining the thermometer, we’ll show you the ropes, buttons, and breadboards of electronics.” — Explore Circuits.
- Codeblocks — Build a coding foundation — “Write programs that bring your designs to life. Block-based code makes it easy to create dynamic, parametric, and adaptive designs.” — Explore Codeblocks.

## Assets
- `home-3d.mp4`/poster, `design-600.mp4`/poster, `dragdrop.mp4`/poster.

## Responsive Behavior
- Copy-left/media-right desktop; media-first stacked cards mobile below 760px.

