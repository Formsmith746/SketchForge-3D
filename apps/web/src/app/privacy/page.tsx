import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | SketchForge",
  description: "How SketchForge handles information in the website and browser-based 3D editor.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <nav className="legal-nav" aria-label="Legal page navigation">
          <a className="legal-brand" href="/">
            <img src="/assets/sketchforge/sketchforge-logo-white.png" alt="" />
            <span>SketchForge</span>
          </a>
          <a className="legal-back" href="/">Back to home</a>
        </nav>
      </header>

      <main className="legal-main">
        <p className="legal-kicker">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Effective: 19 July 2026</p>

        <aside className="legal-notice">
          This policy describes the current SketchForge website and free browser demo. It should be reviewed by qualified legal counsel before material product or data-processing changes are introduced.
        </aside>

        <article className="legal-content">
          <section>
            <h2>1. Scope</h2>
            <p>
              This Privacy Policy explains how the SketchForge contributors handle information when you visit the SketchForge website or use the browser-based 3D editor. It does not cover third-party websites that you choose to visit from SketchForge.
            </p>
          </section>

          <section>
            <h2>2. Information processed</h2>
            <h3>Models and imported files</h3>
            <p>
              3D models and imported design files are processed in your browser and remain on your device. SketchForge works with these files locally while you use the editor.
            </p>
            <h3>Browser storage</h3>
            <p>
              SketchForge uses local or session storage on your device for editor preferences, workplane settings, shared clipboard data, download preferences, temporary editor identity, tutorial status, and anonymous timing flags used to recognise a returning creator on the same browser. You can remove this information through your browser settings.
            </p>
            <h3>Optional aggregate analytics</h3>
            <p>
              When aggregate analytics is enabled in a browser, SketchForge records events such as a visit, successful editor load, first creation, return within 7 or 30 days, tutorial outcome, and editor health outcome. Event requests contain no project files, model contents, names, email addresses, or SketchForge-generated visitor identifier. Standard request information may be processed by the hosting and traffic-analytics provider, including approximate country, browser type, request time, and network information.
            </p>
          </section>

          <section>
            <h2>3. How information is used</h2>
            <ul>
              <li>To operate the website and browser editor.</li>
              <li>To remember local editor settings.</li>
              <li>To troubleshoot and improve editor functionality.</li>
              <li>To understand aggregate use of the editor when analytics is enabled.</li>
            </ul>
            <p>
              SketchForge does not use advertising trackers and does not send model contents through product analytics.
            </p>
          </section>

          <section>
            <h2>4. Legal bases</h2>
            <p>
              Where the GDPR or similar law applies, local preference processing is based on providing the editor functionality you request. You can stop future browser-based analytics requests by clearing the site data stored by your browser.
            </p>
          </section>

          <section>
            <h2>5. Sharing and external links</h2>
            <p>
              SketchForge does not sell personal information or share design files processed by the editor. If you follow an external link, including a link to GitHub, that destination is governed by its own privacy terms.
            </p>
          </section>

          <section>
            <h2>6. Retention and security</h2>
            <p>
              Information stored in your browser remains there until you clear it or the browser removes it. You are responsible for securing your device, browser profile, project exports, and backups.
            </p>
          </section>

          <section>
            <h2>7. Your rights</h2>
            <p>
              Depending on where you live, you may have rights to access, correct, delete, restrict, object to, or receive a portable copy of personal information, and to withdraw consent. You may also complain to your local data-protection authority. Because current design data stays on your device, you can normally manage it directly through the editor and your browser storage controls.
            </p>
          </section>

          <section>
            <h2>8. Children</h2>
            <p>
              SketchForge is not intended to collect personal information from children. A parent, guardian, school, or other responsible adult should supervise use where required by local law.
            </p>
          </section>

          <section>
            <h2>9. Changes and contact</h2>
            <p>
              Material changes will be posted on this page with a new effective date. Questions may be raised through the <a href="https://github.com/Formsmith746/SketchForge-3D" target="_blank" rel="noreferrer">SketchForge GitHub repository</a>. Do not include passwords, private project files, or other sensitive information in a public issue.
            </p>
          </section>
        </article>
      </main>

      <footer className="legal-footer">
        <span>© 2026 SketchForge</span>
        <nav aria-label="Legal footer navigation"><a href="/terms">Terms of Service</a><a href="/">Home</a></nav>
      </footer>
    </div>
  );
}
