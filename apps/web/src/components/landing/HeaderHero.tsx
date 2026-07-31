"use client";

import { useEffect, useState } from "react";

type DropdownName = "tinker" | "resources" | null;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.75" cy="10.75" r="6.75" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m15.75 15.75 4.25 4.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 6.5h18M3 12h18M3 17.5h18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 5 14 14M19 5 5 19" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export default function HeaderHero() {
  const [openDropdown, setOpenDropdown] = useState<DropdownName>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenDropdown(null);
      setIsDrawerOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const toggleDropdown = (name: Exclude<DropdownName, null>) => {
    setOpenDropdown((current) => (current === name ? null : name));
  };

  return (
    <>
      <header className="tc-header">
        <div className="tc-header-inner">
          <button
            className="tc-mobile-toggle"
            type="button"
            aria-label={isDrawerOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-controls="tc-mobile-navigation"
            aria-expanded={isDrawerOpen}
            onClick={() => setIsDrawerOpen((open) => !open)}
          >
            {isDrawerOpen ? <CloseIcon /> : <MenuIcon />}
          </button>

          <a className="tc-brand" href="/" aria-label="SketchForge home">
            <img src="/assets/sketchforge/sketchforge-logo-transparent.png" alt="SketchForge" />
            <span>SketchForge</span>
          </a>

          <nav className="tc-nav" aria-label="Main navigation">
            <div className="tc-nav-dropdown">
              <button type="button" aria-expanded={openDropdown === "tinker"} onClick={() => toggleDropdown("tinker")}>
                Tinker
              </button>
              {openDropdown === "tinker" && (
                <div className="tc-dropdown-menu">
                  <a href="/3d-design">3D Design</a>
                  <a href="/circuits">Circuits</a>
                  <a href="/codeblocks">Codeblocks</a>
                </div>
              )}
            </div>
            <a href="/things">Gallery</a>
            <a href="/learn">Learn</a>
            <a href="/teachers">Teachers</a>
            <div className="tc-nav-dropdown">
              <button type="button" aria-expanded={openDropdown === "resources"} onClick={() => toggleDropdown("resources")}>
                Resources
              </button>
              {openDropdown === "resources" && (
                <div className="tc-dropdown-menu">
                  <a href="/blog">Blog</a>
                  <a href="/help">Help Center</a>
                  <a href="/learn">Learning Center</a>
                </div>
              )}
            </div>
          </nav>

          <div className="tc-header-actions">
            <button className="tc-search" type="button" aria-label="Search"><SearchIcon /></button>
            <a className="tc-sign-up" href="/demo">Try Demo</a>
          </div>

          <button className="tc-mobile-search" type="button" aria-label="Search"><SearchIcon /></button>
        </div>

        {isDrawerOpen && (
          <nav id="tc-mobile-navigation" className="tc-mobile-drawer" aria-label="Mobile navigation">
            <div className="tc-mobile-group">
              <span>Tinker</span>
              <a href="/3d-design">3D Design</a>
              <a href="/circuits">Circuits</a>
              <a href="/codeblocks">Codeblocks</a>
            </div>
            <a href="/things">Gallery</a>
            <a href="/learn">Learn</a>
            <a href="/teachers">Teachers</a>
            <div className="tc-mobile-group">
              <span>Resources</span>
              <a href="/blog">Blog</a>
              <a href="/help">Help Center</a>
              <a href="/learn">Learning Center</a>
            </div>
            <div className="tc-mobile-account-actions">
              <a className="tc-sign-up" href="/demo">Try Demo</a>
            </div>
          </nav>
        )}
      </header>

      <main className="tc-main-no-hero">
        <section className="tc-black-hero" aria-label="SketchForge workplane">
          <img
            className="tc-black-hero-image"
            src="/assets/sketchforge/sketchforge-grid-plane.png"
            alt="SketchForge 3D workplane grid"
          />
        </section>

        <section className="tc-intro" aria-label="About Tinkercad">
          <div className="tc-intro-poster-wrap tc-black-video-panel" aria-hidden="true" />

          <div className="tc-intro-copy">
            <p>Tinkercad is a free web app for 3D design, electronics, and coding, trusted by over 100 million people around the world.</p>
            <p>Build STEM confidence by bringing project-based learning to the classroom.</p>
            <div className="tc-intro-actions">
              <a className="tc-button" href="/join">Start Tinkering</a>
              <a className="tc-button tc-button-secondary" href="/joinclass">Join Class</a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
