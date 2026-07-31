"use client";

import { useEffect, useRef } from "react";

export default function LandingDashboardImage() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const scroller = section?.closest<HTMLElement>(".minimal-landing");
    if (!section || !scroller) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      section.style.setProperty("--dashboard-image-opacity", "0");
      section.style.setProperty("--dashboard-image-shift", "0px");
      section.style.setProperty("--dashboard-image-scale", scroller.clientWidth > 760 ? "0.72" : "1");
      section.style.setProperty("--dashboard-image-x", scroller.clientWidth > 760 ? `${Math.min(360, scroller.clientWidth * 0.225)}px` : "0px");
      section.style.setProperty("--dashboard-image-feature-y", scroller.clientWidth > 760 ? `${Math.min(190, scroller.clientHeight * 0.18)}px` : "0px");
      section.style.setProperty("--dashboard-features-opacity", "0");
      section.style.setProperty("--dashboard-features-shift", "0px");
      section.style.setProperty("--dashboard-editor-x", scroller.clientWidth > 760 ? `${Math.min(360, scroller.clientWidth * 0.225)}px` : "0px");
      section.style.setProperty("--dashboard-editor-y", scroller.clientWidth > 760 ? `${Math.min(190, scroller.clientHeight * 0.18)}px` : "0px");
      section.style.setProperty("--dashboard-editor-scale", scroller.clientWidth > 760 ? "0.72" : "1");
      section.style.setProperty("--dashboard-editor-opacity", "1");
      section.style.setProperty("--dashboard-editor-copy-opacity", "1");
      section.style.setProperty("--dashboard-editor-copy-shift", "0px");
      return;
    }

    let animationFrame = 0;

    const updateFromScroll = () => {
      animationFrame = 0;
      const sectionTop = section.getBoundingClientRect().top;
      const revealStart = scroller.clientHeight * 0.92;
      const revealEnd = scroller.clientHeight * 0.2;
      const revealProgress = Math.min(1, Math.max(0, (revealStart - sectionTop) / (revealStart - revealEnd)));
      const featureStart = scroller.clientHeight * 0.18;
      const featureEnd = scroller.clientHeight * -0.52;
      const featureProgress = Math.min(1, Math.max(0, (featureStart - sectionTop) / (featureStart - featureEnd)));
      const editorStart = scroller.clientHeight * -0.62;
      const editorEnd = scroller.clientHeight * -1.22;
      const editorProgress = Math.min(1, Math.max(0, (editorStart - sectionTop) / (editorStart - editorEnd)));
      const isCompact = scroller.clientWidth <= 760;
      const horizontalDistance = isCompact ? 0 : Math.min(360, scroller.clientWidth * 0.225);
      const verticalDistance = isCompact ? 0 : Math.min(190, scroller.clientHeight * 0.18);
      const horizontalShift = horizontalDistance * featureProgress;
      const verticalShift = verticalDistance * featureProgress;
      const finalScale = isCompact ? 1 : 0.72;
      const imageScale = 0.94 + revealProgress * 0.06 - featureProgress * (1 - finalScale);
      const homeOpacity = (0.04 + revealProgress * 0.96) * (1 - editorProgress);

      section.style.setProperty("--dashboard-image-opacity", String(homeOpacity));
      section.style.setProperty("--dashboard-image-shift", `${Math.round((1 - revealProgress) * 64)}px`);
      section.style.setProperty("--dashboard-image-scale", String(imageScale));
      section.style.setProperty("--dashboard-image-x", `${Math.round(horizontalShift)}px`);
      section.style.setProperty("--dashboard-image-feature-y", `${Math.round(verticalShift)}px`);
      section.style.setProperty("--dashboard-features-opacity", String(featureProgress * (1 - editorProgress)));
      section.style.setProperty("--dashboard-features-shift", `${Math.round((1 - featureProgress) * -44)}px`);
      section.style.setProperty("--dashboard-editor-opacity", String(editorProgress));
      section.style.setProperty("--dashboard-editor-x", `${Math.round(horizontalDistance)}px`);
      section.style.setProperty("--dashboard-editor-y", `${Math.round(verticalDistance + (1 - editorProgress) * 34)}px`);
      section.style.setProperty("--dashboard-editor-scale", String(finalScale));
      section.style.setProperty("--dashboard-editor-copy-opacity", String(editorProgress));
      section.style.setProperty("--dashboard-editor-copy-shift", `${Math.round((1 - editorProgress) * -44)}px`);
    };

    const requestUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateFromScroll);
    };

    updateFromScroll();
    scroller.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      scroller.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <section ref={sectionRef} className="landing-dashboard-showcase landing-dashboard-image-showcase" aria-label="SketchForge project and editor previews">
      <span className="landing-scroll-target landing-scroll-target--projects" id="project-home" aria-hidden="true" />
      <span className="landing-scroll-target landing-scroll-target--editor" id="editor-tools" aria-hidden="true" />
      <div className="landing-dashboard-image-stage">
        <div className="landing-dashboard-feature-copy">
          <p className="landing-dashboard-feature-kicker">Your projects, ready</p>
          <h2>Start faster. Pick up exactly where you left off.</h2>
          <p className="landing-dashboard-feature-intro">
            SketchForge keeps the first step simple, whether you are creating from scratch, importing a model, or returning to a workplane.
          </p>
          <ul>
            <li><span>01</span><div><strong>Create instantly</strong><p>Open a fresh 3D design directly from your project home.</p></div></li>
            <li><span>02</span><div><strong>Import STL or SVG</strong><p>Bring existing geometry into the same focused workspace.</p></div></li>
            <li><span>03</span><div><strong>Continue your work</strong><p>Find recent projects and return to the latest version quickly.</p></div></li>
          </ul>
        </div>

        <div className="landing-dashboard-feature-copy landing-dashboard-feature-copy--editor">
          <p className="landing-dashboard-feature-kicker">Precise modelling controls</p>
          <h2>Shape, refine, and control every detail.</h2>
          <p className="landing-dashboard-feature-intro">
            Build directly on the workplane while the selected group, material state, and exact dimensions stay visible beside the model.
          </p>
          <ul>
            <li><span>01</span><div><strong>Model in context</strong><p>Keep the workplane, view cube, zoom controls, and selected geometry in one clear canvas.</p></div></li>
            <li><span>02</span><div><strong>Edit precisely</strong><p>Adjust length, width, and height while switching the selection between solid and hole.</p></div></li>
            <li><span>03</span><div><strong>Refine without detours</strong><p>Group, combine, modify, arrange, and export from the same focused toolbar.</p></div></li>
          </ul>
        </div>

        <figure className="landing-dashboard-image-frame landing-dashboard-image-frame--home">
          <img
            src="/assets/landing/project-dashboard.png"
            alt="SketchForge projects dashboard with project actions, sidebar navigation, and an untitled design"
          />
        </figure>

        <figure className="landing-dashboard-image-frame landing-dashboard-image-frame--editor">
          <img
            src="/assets/landing/editor-phone-stand.png"
            alt="SketchForge editor showing a selected red phone stand with solid and hole controls and exact dimensions"
          />
        </figure>

      </div>
    </section>
  );
}
