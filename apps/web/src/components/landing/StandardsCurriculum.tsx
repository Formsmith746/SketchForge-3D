import Image from "next/image";

const curriculumCards = [
  {
    label: "3D Design",
    href: "/teachers/3d-printing",
    image: "/assets/tinkercad/3dprinting_w600.jpg",
    alt: "A colorful 3D design prepared for 3D printing.",
    width: 600,
    height: 450,
  },
  {
    label: "Architecture",
    href: "/teachers/architecture",
    image: "/assets/tinkercad/arch_w600.jpg",
    alt: "An architectural model created with Tinkercad.",
    width: 540,
    height: 450,
  },
  {
    label: "Art & 3D Design",
    href: "/teachers/art-3d-design",
    image: "/assets/tinkercad/3d-card_w600.jpg",
    alt: "A colorful art and 3D design project.",
    width: 540,
    height: 447,
  },
  {
    label: "Robotics",
    href: "/teachers/robotics",
    image: "/assets/tinkercad/robotics_w600.jpg",
    alt: "A student robotics project made with electronic components.",
    width: 600,
    height: 450,
  },
] as const;

export default function StandardsCurriculum() {
  return (
    <>
      <section className="tc-standards" aria-labelledby="tc-standards-title">
        <div className="tc-standards-inner">
          <div className="tc-standards-image-wrap">
            <Image
              className="tc-standards-image"
              src="/assets/tinkercad/educational-standards_w600.jpg"
              alt="A young girl using a laptop in a classroom."
              width={600}
              height={420}
              sizes="(max-width: 760px) 100vw, 458px"
            />
          </div>

          <div className="tc-standards-copy">
            <h2 id="tc-standards-title">Aligned to educational standards</h2>
            <p>
              Tinkercad is proud to be KidSAFE COPPA certified. Our lesson plans adhere to Common Core and NGSS standards for the classroom.
            </p>
            <div className="tc-standards-logos" aria-label="Supported educational standards">
              <Image
                src="/assets/tinkercad/ngss_w450.png"
                alt="NGSS Logo"
                width={202}
                height={97}
              />
              <Image
                src="/assets/tinkercad/common-core_w450.png"
                alt="Common Core Logo"
                width={300}
                height={82}
              />
            </div>
            <a className="tc-button" href="/teachers">Explore Classrooms</a>
          </div>
        </div>
      </section>

      <section className="tc-curriculum" aria-labelledby="tc-curriculum-title">
        <div className="tc-curriculum-inner">
          <div className="tc-curriculum-lead">
            <h2 id="tc-curriculum-title">Curriculum for every subject</h2>
            <p>
              Whether you&apos;re teaching computer science, math, social studies, or more - we&apos;ve got resources.
            </p>
          </div>

          <div className="tc-curriculum-grid">
            {curriculumCards.map((card, index) => (
              <a
                key={card.label}
                className={`tc-curriculum-card${index === 3 ? " tc-curriculum-card-mobile-hidden" : ""}`}
                href={card.href}
              >
                <Image
                  className="tc-curriculum-card-image"
                  src={card.image}
                  alt={card.alt}
                  width={card.width}
                  height={card.height}
                  sizes="(max-width: 760px) 100vw, 25vw"
                />
                <span className="tc-curriculum-card-label">{card.label}</span>
              </a>
            ))}
          </div>

          <div className="tc-curriculum-cta">
            <a className="tc-button" href="/teachers">Browse Curriculum</a>
          </div>
        </div>
      </section>
    </>
  );
}
