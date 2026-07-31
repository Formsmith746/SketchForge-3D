import Image from "next/image";

const trustCards = [
  {
    image: "/assets/tinkercad/trust-free.svg",
    alt: "Three smiling people.",
    title: "Free for everyone",
    body: "No downloads. No strings attached. Start creating from the first click.",
    href: "/join",
    label: "Start Tinkering \u203a",
  },
  {
    image: "/assets/tinkercad/trust-learn.svg",
    alt: "A laptop with parts and a caliper next to it.",
    title: "Learn by doing",
    body: "Hands-on projects build confidence, persistence, and problem-solving skills.",
    href: "/projects",
    label: "Explore Projects \u203a",
  },
  {
    image: "/assets/tinkercad/trust-safe.svg",
    alt: "A shield with a checkmark and an apple.",
    title: "Safe for all ages",
    body: "Ad-free and kidSAFE-certified to ensure privacy and a safe learning environment.",
    href: "/privacy",
    label: "Privacy & Security \u203a",
  },
] as const;

export function TrustBanner() {
  return (
    <section className="tc-trust">
      <div className="tc-trust-grid">
        {trustCards.map((card) => (
          <article className="tc-trust-card" key={card.title}>
            <Image
              className="tc-trust-illustration"
              src={card.image}
              alt={card.alt}
              width={250}
              height={167}
            />
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            <a href={card.href}>{card.label}</a>
          </article>
        ))}
      </div>

      <div className="tc-people-banner">
        <div className="tc-people-inner">
          <p>
            More than <strong>100 million people</strong> have trusted Tinkercad
            to bring <strong>800+ million designs to life</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
