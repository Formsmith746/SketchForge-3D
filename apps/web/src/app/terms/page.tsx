import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | SketchForge",
  description: "Terms governing access to the SketchForge website and browser-based 3D editor.",
};

export default function TermsOfServicePage() {
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
        <h1>Terms of Service</h1>
        <p className="legal-updated">Effective: 19 July 2026</p>

        <aside className="legal-notice">
          These are starter terms for the current free browser demo and should be reviewed by qualified legal counsel before material product changes are released.
        </aside>

        <article className="legal-content">
          <section>
            <h2>1. Acceptance</h2>
            <p>
              By accessing or using the SketchForge website or browser editor, you agree to these Terms of Service. If you do not agree, do not use the service. If you use SketchForge on behalf of an organisation, you confirm that you are authorised to accept these terms for it.
            </p>
          </section>

          <section>
            <h2>2. The current demo</h2>
            <p>
              SketchForge currently provides a free browser-based 3D modelling demo. Features may be experimental, incomplete, changed, suspended, or removed as development continues.
            </p>
          </section>

          <section>
            <h2>3. Your projects</h2>
            <p>
              You retain ownership of models, files, and other content you create or import. That content is processed on your device. You are responsible for keeping backups, confirming exports, and ensuring that you have the rights needed to use any imported material.
            </p>
          </section>

          <section>
            <h2>4. Acceptable use</h2>
            <p>You may not use SketchForge to:</p>
            <ul>
              <li>Break applicable law or infringe another person’s rights.</li>
              <li>Attempt to disrupt, overload, bypass, or compromise the service or its security.</li>
              <li>Introduce malware or use automated access that materially interferes with other users.</li>
              <li>Misrepresent your relationship with SketchForge or its contributors.</li>
            </ul>
          </section>

          <section>
            <h2>5. Open-source software</h2>
            <p>
              The SketchForge source code is made available under the MIT License. The licence governs your use, copying, modification, and distribution of the software source. These Terms govern use of the website and demo and do not replace rights granted by the MIT License.
            </p>
          </section>

          <section>
            <h2>6. External links</h2>
            <p>
              SketchForge may link to external websites such as GitHub. Those destinations have their own terms and policies. SketchForge is not responsible for external content outside its control.
            </p>
          </section>

          <section>
            <h2>7. Availability and changes</h2>
            <p>
              The service is provided without a promise of uninterrupted availability. SketchForge may change the editor, website, or these Terms. Material changes will be posted with a new effective date. Continued use after a change means you accept the updated Terms where permitted by law.
            </p>
          </section>

          <section>
            <h2>8. Disclaimers</h2>
            <p>
              To the maximum extent permitted by law, the service is provided “as is” and “as available,” without warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, or reliability. SketchForge is a design tool, and you are responsible for validating dimensions, geometry, exports, manufacturing suitability, and safety before relying on a model.
            </p>
          </section>

          <section>
            <h2>9. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, SketchForge contributors will not be liable for indirect, incidental, special, consequential, or punitive loss, or for loss of data, profits, revenue, or opportunity arising from use of the service. Nothing in these Terms excludes liability or consumer rights that cannot legally be excluded.
            </p>
          </section>

          <section>
            <h2>10. Ending use</h2>
            <p>
              You may stop using SketchForge at any time. Access may be limited or blocked where reasonably necessary to protect the service, comply with law, or respond to a serious breach of these Terms.
            </p>
          </section>

          <section>
            <h2>11. Applicable law and disputes</h2>
            <p>
              Applicable law governs these Terms without removing any mandatory rights you have as a consumer. Before starting formal proceedings, the parties should try in good faith to resolve a dispute through written communication where practical.
            </p>
          </section>

          <section>
            <h2>12. Contact</h2>
            <p>
              Questions about these Terms may be raised through the <a href="https://github.com/Formsmith746/SketchForge-3D" target="_blank" rel="noreferrer">SketchForge GitHub repository</a>. Do not post confidential information in a public issue.
            </p>
          </section>
        </article>
      </main>

      <footer className="legal-footer">
        <span>© 2026 SketchForge</span>
        <nav aria-label="Legal footer navigation"><a href="/privacy">Privacy Policy</a><a href="/">Home</a></nav>
      </footer>
    </div>
  );
}
