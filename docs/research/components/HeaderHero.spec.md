# HeaderHero Specification

## Overview
- Target file: `apps/web/src/components/landing/HeaderHero.tsx`
- Interaction model: fixed header + desktop dropdowns + mobile drawer + video play/pause.

## DOM Structure
- Fixed header: logo, five navigation labels, search glyph, Log In, Sign Up.
- Hero: full-bleed video/poster, centered H1, play/pause control.
- Intro: overlapping feature poster with Play video control, two centered paragraphs, two pill CTAs.

## Computed Styles
- Header desktop: 1280x81, fixed top, z-index 3, background `#1477d1`, padding `10px 32px`.
- Logo: 184x48.525; source `tinkercad-lockup-white.svg`.
- Navigation labels: Artifakt Element, 16px/24px, 700, white; padding 4px 12px; margin 10px 4px; radius 20px.
- Log In: 14px/21px 700; white 1.6px border; radius 50px; padding 4px 16px.
- Sign Up: white background, blue text; 14px/21px 700; padding 6px 16px; radius 50px.
- Hero desktop: 500px high; video absolute 100% x 500, object-fit cover; H1 48px/58px 700 Artifakt Legend; margin 100px 0 40px.
- Hero mobile: header 60px, hero 375px; video remains 500px and crops; H1 32px/38px with 35px padding and 80px top margin.
- Intro wrapper: max-width 1200; padding 0 75; poster 605x340 desktop with radius 8px, top -75px.
- Intro poster mobile: 350x196; wrapper padding 0 25px; negative overlap remains 75px.
- Intro paragraphs: 16px/24px 700, `#282727`, centered; desktop widths 605; mobile full width.
- CTAs: `#1477d1`, white, 15px/21px 700, padding 7px 18px, radius 50px.

## States & Behaviors
- Header remains solid blue at every scroll position.
- Hero video auto-plays muted and loops. Circular control toggles play/pause.
- Feature poster opens a centered modal containing the local hero video; Escape/backdrop/close dismiss it.
- Desktop Tinker and Resources controls reveal compact dropdowns on click/hover.
- Mobile drawer appears below 760px and contains all nav/account links.

## Assets
- `hero-home-poster-airplane_w1800.jpg`, `hero-homepage-2000.mp4`
- `feature-video-poster_w600.jpg`, `tinkercad-lockup-white.svg`

## Text Content
- H1: “All you need is a ‘what if...’”
- “Tinkercad is a free web app for 3D design, electronics, and coding, trusted by over 100 million people around the world.”
- “Build STEM confidence by bringing project-based learning to the classroom.”
- Buttons: Play video, Start Tinkering, Join Class.

## Responsive Behavior
- Desktop: full nav, centered hero, horizontal CTAs.
- Mobile <=760px: hamburger/logo/search only; 375px hero; stacked CTA buttons; 25px gutters.

