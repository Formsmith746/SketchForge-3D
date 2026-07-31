# Tinkercad Landing Page Behaviors

- Header: fixed at the top; solid `#1477d1`; no scroll-state class or visual change from scrollY 0 through the footer.
- Hero video: muted and auto-playing on the live page with a circular pause/play control at bottom-right (top-right on mobile).
- Feature poster: clicking `Play video` opens a video modal on the source page. The clone provides a modal using the local hero video.
- Product videos: muted, looping visual demonstrations; a center play control appears when playback is paused.
- Buttons and links: pill buttons darken on hover; text links underline or deepen in color.
- Navigation dropdowns: Tinker and Resources are pointer/click menus on desktop. The clone keeps their visible labels and compact chevrons.
- Mobile navigation: desktop navigation and account actions collapse behind a hamburger drawer below 760px.
- Curriculum: static grid, not tabs or scroll-driven. Four cards desktop, three visible mobile.
- No section uses scroll snap, parallax, sticky panels, or intersection-driven content switching.
- Reduced motion: videos remain available as poster images and transitions are disabled under `prefers-reduced-motion`.

Responsive observations:

- Desktop reference inspected at 1280x720 (the in-app browser's maximum desktop surface); content max-width is 1200px, so the same values apply at 1440px with wider outer gutters.
- Mobile reference extracted at 390x844 after responsive reload.
- The source page's video-heavy document repeatedly timed out its screenshot capture surface. All values in component specs come from live DOM, computed CSS, responsive geometry, and downloaded source assets.

