"use client";

import {
  ChevronDown,
  Clock3,
  Grid3X3,
  Home,
  List,
  MoreVertical,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { useEffect, useRef } from "react";

export default function LandingDashboardShowcase() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const scroller = section.closest<HTMLElement>(".minimal-landing");
    if (!scroller) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      section.style.setProperty("--dashboard-opacity", "1");
      section.style.setProperty("--dashboard-shift", "0px");
      section.style.setProperty("--dashboard-scale", "1");
      section.style.setProperty("--dashboard-blur", "0px");
      return;
    }

    let animationFrame = 0;

    const updateProgress = () => {
      animationFrame = 0;
      const sectionTop = section.getBoundingClientRect().top;
      const revealStart = scroller.clientHeight * 0.92;
      const revealEnd = scroller.clientHeight * 0.2;
      const progress = Math.min(1, Math.max(0, (revealStart - sectionTop) / (revealStart - revealEnd)));

      section.style.setProperty("--dashboard-opacity", String(0.06 + progress * 0.94));
      section.style.setProperty("--dashboard-shift", `${Math.round((1 - progress) * 72)}px`);
      section.style.setProperty("--dashboard-scale", String(0.965 + progress * 0.035));
      section.style.setProperty("--dashboard-blur", `${((1 - progress) * 3).toFixed(2)}px`);
    };

    const requestProgressUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    scroller.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate);

    return () => {
      scroller.removeEventListener("scroll", requestProgressUpdate);
      window.removeEventListener("resize", requestProgressUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="landing-dashboard-showcase"
      aria-labelledby="dashboard-showcase-heading"
    >
      <div className="landing-dashboard-frame">
        <header className="landing-dashboard-topbar">
          <div className="landing-dashboard-brand">
            <img src="/assets/sketchforge/sketchforge-logo.png" alt="" />
            <span>SketchForge</span>
          </div>

          <label className="landing-dashboard-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search projects</span>
            <input type="search" placeholder="Search projects" />
          </label>

          <a className="landing-dashboard-create" href="/demo">
            <Plus aria-hidden="true" />
            Create
          </a>
        </header>

        <div className="landing-dashboard-body">
          <aside className="landing-dashboard-sidebar" aria-label="Project navigation">
            <nav>
              <a className="is-active" href="#dashboard-showcase-heading">
                <Home aria-hidden="true" />
                Home
              </a>
              <a href="#dashboard-projects">
                <SlidersHorizontal aria-hidden="true" />
                Challenges
              </a>
            </nav>
            <a className="landing-dashboard-settings" href="#dashboard-projects">
              <Settings aria-hidden="true" />
              Settings
            </a>
          </aside>

          <div className="landing-dashboard-main">
            <h2 id="dashboard-showcase-heading" className="sr-only">SketchForge project dashboard</h2>

            <div className="landing-dashboard-actions">
              <a className="landing-dashboard-action is-primary" href="/demo">
                <span><Plus aria-hidden="true" /></span>
                <strong>Create new 3D design</strong>
              </a>
              <a className="landing-dashboard-action" href="/demo">
                <span><Upload aria-hidden="true" /></span>
                <strong>Import STL/SVG</strong>
              </a>
              <a className="landing-dashboard-action" href="/demo">
                <span><Clock3 aria-hidden="true" /></span>
                <strong>Continue workplane</strong>
              </a>
            </div>

            <div className="landing-dashboard-projects-head" id="dashboard-projects">
              <div>
                <h3>Projects</h3>
                <p>1 visible</p>
              </div>

              <div className="landing-dashboard-view-controls" aria-label="Project display controls">
                <button type="button">
                  <SlidersHorizontal aria-hidden="true" />
                  Recent
                  <ChevronDown aria-hidden="true" />
                </button>
                <button className="is-selected" type="button" aria-label="Grid view"><Grid3X3 aria-hidden="true" /></button>
                <button type="button" aria-label="List view"><List aria-hidden="true" /></button>
              </div>
            </div>

            <article className="landing-dashboard-project-card">
              <div className="landing-dashboard-project-preview">
                <div className="landing-dashboard-mini-grid" role="img" aria-label="Empty SketchForge workplane" />
                <button type="button" aria-label="Project options"><MoreVertical aria-hidden="true" /></button>
              </div>
              <h4>Untitled design 1</h4>
              <p>Just now · 0 shapes</p>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
