import LandingDashboardImage from "@/components/landing/LandingDashboardImage";
import LandingHeaderNavigation from "@/components/landing/LandingHeaderNavigation";

export default function LandingPage() {
  return (
    <div className="minimal-landing minimal-landing-hero-only" aria-label="SketchForge landing page">
      <header className="minimal-landing-blue">
        <nav className="minimal-nav" aria-label="Main navigation">
          <a className="minimal-nav-brand" href="/" aria-label="SketchForge home">
            <img src="/assets/sketchforge/sketchforge-logo-white.png" alt="" />
            <span>SketchForge</span>
          </a>

          <LandingHeaderNavigation />

          <div className="minimal-nav-actions">
            <a className="minimal-nav-external" href="https://github.com/Formsmith746/SketchForge-3D" target="_blank" rel="noreferrer">
              GitHub <span aria-hidden="true">↗</span>
            </a>
            <a className="minimal-nav-cta" href="/demo">Try Demo</a>
          </div>
        </nav>
      </header>

      <main>
        <section className="minimal-landing-white" id="overview" aria-label="SketchForge hero">
          <div className="minimal-hero-inner">
            <img
              className="minimal-hero-cube"
              src="/assets/sketchforge/hero-red-cube.png"
              alt=""
              aria-hidden="true"
            />
            <img
              className="minimal-hero-cone"
              src="/assets/sketchforge/hero-orange-cone.png"
              alt=""
              aria-hidden="true"
            />

            <div className="minimal-hero-content">
              <p className="minimal-hero-kicker">Free browser demo</p>
              <h1>
                <span>Forge ideas into 3D,</span>
                <span>right in your browser</span>
              </h1>
              <p className="minimal-hero-summary">
                Shape, combine, refine, import, and export models in one focused workspace. No account or payment required.
              </p>

              <div className="minimal-hero-actions">
                <a className="minimal-hero-primary" href="/demo">
                  <span className="minimal-hero-play" aria-hidden="true">▶</span>
                  Try Demo
                </a>
              </div>
            </div>

            <div className="minimal-hero-visual">
              <img
                className="minimal-hero-toolbar"
                src="/assets/sketchforge/hero-editor-toolbar.png"
                alt="SketchForge editor toolbar"
              />
              <img
                className="minimal-hero-image"
                src="/assets/sketchforge/hero-workspace-robot-new.png"
                alt="Yellow robot arm on the SketchForge 3D workplane"
              />
            </div>
          </div>
        </section>
        <LandingDashboardImage />
      </main>

      <footer className="landing-footer minimal-footer">
        <div className="minimal-footer-inner">
          <div className="minimal-footer-identity">
            <a className="landing-footer-brand" href="/" aria-label="SketchForge home">
              <img src="/assets/sketchforge/sketchforge-logo-white.png" alt="" />
              <span>SketchForge</span>
            </a>
            <span>© 2026 SketchForge</span>
          </div>
          <p>Approachable 3D modelling and fast iteration, directly in your browser.</p>
          <nav aria-label="Footer navigation">
            <a href="/demo">Try Demo</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="https://github.com/Formsmith746/SketchForge-3D" target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
