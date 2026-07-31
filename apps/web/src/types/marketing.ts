export interface LandingLink {
  label: string;
  href: string;
}

export interface ProductFeature extends LandingLink {
  eyebrow: string;
  title: string;
  description: string;
  video: string;
  poster: string;
  videoLabel: string;
}

export interface CurriculumCard extends LandingLink {
  image: string;
}
