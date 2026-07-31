# TrustBanner Specification

## Overview
- Target file: `apps/web/src/components/landing/TrustBanner.tsx`
- Interaction model: static cards with hoverable links.

## DOM Structure
- Three trust cards in a centered row.
- Blue full-width statistics banner underneath.

## Computed Styles
- Cards wrapper: max-width 1200, padding 0 75px 100px, display flex, centered.
- Desktop card: width 250, margin 0 50, flex column, text-align center.
- Illustration: 250x166.663.
- Heading: 20px/30px 700 Artifakt Legend, `#282727`, margin 20px 0 30px.
- Body: 16px/24px 500, `#646e80`, margin-bottom 20px.
- Link: 16px/24px 700, `#1477d1`.
- Mobile wrapper: column, padding 0 25px 100px; illustrations hidden; cards 154px high, margin 16px 0, left aligned; heading margin 20px 0 16px; body margin-bottom 16px.
- Banner desktop: 234px, `#0044c9`, background `banner_million.svg`; inner padding 60px 0.
- Banner text desktop: max-width 568, 32px/38px 300 Artifakt Legend, white, centered.
- Banner mobile: 206px; padding 45px 24px; text 24px/29px.

## Text Content
- Free for everyone — No downloads. No strings attached. Start creating from the first click. — Start Tinkering ›
- Learn by doing — Hands-on projects build confidence, persistence, and problem-solving skills. — Explore Projects ›
- Safe for all ages — Ad-free and kidSAFE-certified to ensure privacy and a safe learning environment. — Privacy & Security ›
- More than 100 million people have trusted Tinkercad to bring 800+ million designs to life.

## Assets
- `trust-free.svg`, `trust-learn.svg`, `trust-safe.svg`, `banner_million.svg`.

## Responsive Behavior
- Three-column desktop, single-column mobile; artwork removed on mobile.

