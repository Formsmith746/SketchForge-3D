import Image from "next/image";

const footerGroups = [
  {
    heading: "Tinker",
    links: [
      ["3D Design", "/3d-design"],
      ["Circuits", "/circuits"],
      ["Codeblocks", "/codeblocks"],
      ["iPad App", "/ipad-app"],
      ["Sim Lab", "/simlab"],
    ],
  },
  {
    heading: "Teachers",
    links: [
      ["Classrooms", "/teachers"],
      ["Projects", "/projects"],
      ["Challenges", "/challenges"],
      ["Design & Make skills", "/design-make"],
      ["Privacy & Security", "/privacy"],
    ],
  },
  {
    heading: "Resources",
    links: [
      ["Blog", "/blog"],
      ["Help Center", "/help"],
      ["Learning Center", "/learn"],
      ["Tips & Tricks", "/blog?tags=Tips%20%26%20Tricks"],
      ["Server Status", "https://health.autodesk.com/"],
    ],
  },
] as const;

const socialLinks = [
  ["X", "https://x.com/tinkercad"],
  ["Instagram", "https://www.instagram.com/tinkercad/"],
  ["Facebook", "https://www.facebook.com/Tinkercad/"],
  ["YouTube", "https://www.youtube.com/tinkercad"],
] as const;

export function LandingFooter() {
  return (
    <>
      <section className="tc-footer-cta">
        <div className="tc-footer-cta-inner">
          <h2>Tomorrow&rsquo;s innovators are made today</h2>
          <p>
            At Autodesk, we empower innovators everywhere to take the problems
            of today and turn them into something amazing.
          </p>
          <div className="tc-footer-cta-actions">
            <a className="tc-button" href="/join">
              Start Tinkering
            </a>
            <a className="tc-button" href="/joinclass">
              Join Class
            </a>
          </div>
        </div>
      </section>

      <footer className="tc-footer">
        <div className="tc-footer-main">
          <div className="tc-footer-about">
            <p>
              Tinkercad is a free web app for 3D design, electronics, and
              coding. We&rsquo;re the ideal introduction to Autodesk, a global
              leader in design and make technology.
            </p>
            <h3>Follow Us</h3>
            <nav className="tc-footer-social" aria-label="Follow us">
              {socialLinks.map(([label, href]) => (
                <a href={href} key={label}>
                  {label}
                </a>
              ))}
            </nav>
          </div>

          {footerGroups.map((group) => (
            <div className="tc-footer-group" key={group.heading}>
              <h3>{group.heading}</h3>
              {group.links.map(([label, href]) => (
                <a href={href} key={label}>
                  {label}
                </a>
              ))}
            </div>
          ))}

          <div className="tc-footer-utility">
            <a href="https://www.autodesk.com">
              <Image
                src="/assets/tinkercad/autodesk-logo.svg"
                alt="Autodesk Logo"
                width={146}
                height={15}
              />
            </a>
            <select aria-label="Select language" defaultValue="English">
              <option value="English">English</option>
              <option value="Deutsch">Deutsch</option>
              <option value="Español">Español</option>
              <option value="Français">Français</option>
              <option value="Italiano">Italiano</option>
            </select>
            <a href="https://apps.chrome/getit/acc638ca-7aff-405c-8648-d57276d74d1a">
              <Image
                src="/assets/tinkercad/chrome-store.svg"
                alt="Add to Chromebook"
                width={166}
                height={50}
              />
            </a>
          </div>
        </div>

        <hr />

        <div className="tc-footer-privacy">
          <a href="https://kidsafe.com/member/tinkercad">kidSAFE</a>
          <p>
            Tinkercad and <a href="/childrens-privacy">Children&rsquo;s Privacy</a>
          </p>
        </div>

        <hr />

        <p className="tc-footer-legal">
          Free use of Tinkercad is subject to acceptance of and compliance with
          the <a href="/terms">Terms of Service</a> and any other terms provided
          in connection with the service.
        </p>

        <div className="tc-footer-bottom">
          <a href="/autodesk-privacy">Privacy Statement</a>
          <span className="tc-footer-separator" />
          <a href="/privacy">Privacy &amp; Security</a>
          <span className="tc-footer-separator" />
          <a href="https://www.autodesk.com/company/legal-notices-trademarks">
            Legal &amp; Trademarks
          </a>
          <span className="tc-footer-separator" />
          <a href="/terms">Terms of Service</a>
          <span className="tc-footer-separator" />
          <p>&copy; 2026 Autodesk, Inc, All Rights Reserved.</p>
        </div>
      </footer>
    </>
  );
}
