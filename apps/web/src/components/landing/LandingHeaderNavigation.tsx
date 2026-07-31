"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

const explanationStops = {
  projects: 0.52,
  editor: 1.22,
} as const;

const resourceLinks = [
  { label: "Updates", href: "/updates" },
  { label: "Tutorials", href: "/tutorials" },
  { label: "Compare", href: "/compare" },
  { label: "Documentation", href: "/documentation" },
] as const;

export default function LandingHeaderNavigation() {
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const resourcesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resourcesOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!resourcesRef.current?.contains(event.target as Node)) setResourcesOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setResourcesOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [resourcesOpen]);

  const scrollToOverview = (event: MouseEvent<HTMLAnchorElement>) => {
    const scroller = document.querySelector<HTMLElement>(".minimal-landing");
    if (!scroller) return;
    event.preventDefault();
    window.history.replaceState(null, "", "#overview");
    scroller.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToExplanation = (
    event: MouseEvent<HTMLAnchorElement>,
    stop: keyof typeof explanationStops,
    hash: string,
  ) => {
    const scroller = document.querySelector<HTMLElement>(".minimal-landing");
    const section = document.querySelector<HTMLElement>(".landing-dashboard-image-showcase");
    if (!scroller || !section) return;
    event.preventDefault();
    window.history.replaceState(null, "", hash);
    if (scroller.clientWidth <= 760) {
      const target = section.querySelector<HTMLElement>(
        stop === "editor"
          ? ".landing-dashboard-feature-copy--editor"
          : ".landing-dashboard-feature-copy:not(.landing-dashboard-feature-copy--editor)",
      );
      if (!target) return;
      const top = scroller.scrollTop
        + target.getBoundingClientRect().top
        - scroller.getBoundingClientRect().top
        - 76;
      scroller.scrollTo({ top, behavior: "smooth" });
      return;
    }
    const top = section.offsetTop + scroller.clientHeight * explanationStops[stop];
    scroller.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div className="minimal-nav-center" ref={resourcesRef}>
      <a href="#overview" onClick={scrollToOverview}>Overview</a>
      <a href="#project-home" onClick={(event) => scrollToExplanation(event, "projects", "#project-home")}>Projects</a>
      <a href="#editor-tools" onClick={(event) => scrollToExplanation(event, "editor", "#editor-tools")}>Editor</a>
      <div className="minimal-nav-resources">
        <button
          className="minimal-nav-resources-trigger"
          type="button"
          aria-haspopup="menu"
          aria-expanded={resourcesOpen}
          onClick={() => setResourcesOpen((open) => !open)}
        >
          Resources
          <ChevronDown className="minimal-nav-resources-chevron" aria-hidden="true" />
        </button>
        {resourcesOpen ? (
          <div className="minimal-nav-resources-menu" role="menu" aria-label="Resources">
            {resourceLinks.map((resource) => (
              <a
                key={resource.href}
                href={resource.href}
                role="menuitem"
                onClick={() => setResourcesOpen(false)}
              >
                {resource.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <a className="minimal-nav-donate" href="https://github.com/sponsors/Formsmith746" target="_blank" rel="noreferrer">Donate</a>
      <button
        className="minimal-nav-mobile-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={resourcesOpen}
        onClick={() => setResourcesOpen((open) => !open)}
      >
        Menu
        <ChevronDown className="minimal-nav-resources-chevron" aria-hidden="true" />
      </button>
      {resourcesOpen ? (
        <div className="minimal-nav-mobile-menu" role="menu" aria-label="Main navigation">
          <a href="#overview" role="menuitem" onClick={(event) => {
            setResourcesOpen(false);
            scrollToOverview(event);
          }}>Overview</a>
          <a href="#project-home" role="menuitem" onClick={(event) => {
            setResourcesOpen(false);
            scrollToExplanation(event, "projects", "#project-home");
          }}>Projects</a>
          <a href="#editor-tools" role="menuitem" onClick={(event) => {
            setResourcesOpen(false);
            scrollToExplanation(event, "editor", "#editor-tools");
          }}>Editor</a>
          <span className="minimal-nav-mobile-label">Resources</span>
          {resourceLinks.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              role="menuitem"
              onClick={() => setResourcesOpen(false)}
            >
              {resource.label}
            </a>
          ))}
          <a
            href="https://github.com/sponsors/Formsmith746"
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            onClick={() => setResourcesOpen(false)}
          >
            Donate
          </a>
        </div>
      ) : null}
    </div>
  );
}
