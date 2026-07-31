"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import type { ProductFeature } from "@/types/marketing";

const products: ProductFeature[] = [
  {
    eyebrow: "3D Design",
    title: "Start designing in 3D",
    description:
      "If you can dream it, you can build it. From product models to printable parts, 3D design is the first step in making your ideas real.",
    label: "Explore 3D Design",
    href: "/3d-design",
    video: "/assets/tinkercad/home-3d.mp4",
    poster: "/assets/tinkercad/home-3d-poster_w600.jpg",
    videoLabel: "Combining a wheel, spokes, and a ring to make a gear.",
  },
  {
    eyebrow: "Circuits",
    title: "Power up your imagination",
    description:
      "From blinking your first LED to reimagining the thermometer, we\u2019ll show you the ropes, buttons, and breadboards of electronics.",
    label: "Explore Circuits",
    href: "/circuits",
    video: "/assets/tinkercad/design-600.mp4",
    poster: "/assets/tinkercad/design-poster_w600.jpg",
    videoLabel: "A battery connected to three LEDs.",
  },
  {
    eyebrow: "Codeblocks",
    title: "Build a coding foundation",
    description:
      "Write programs that bring your designs to life. Block-based code makes it easy to create dynamic, parametric, and adaptive designs.",
    label: "Explore Codeblocks",
    href: "/codeblocks",
    video: "/assets/tinkercad/dragdrop.mp4",
    poster: "/assets/tinkercad/dragdrop-poster_w600.jpg",
    videoLabel: "Block code assembling a parametric design.",
  },
];

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 5.5v13l10-6.5L8 5.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" fill="currentColor" />
    </svg>
  );
}

function ProductVideo({ product }: { product: ProductFeature }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  const togglePlayback = () => {
    const video = videoRef.current;

    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  };

  return (
    <div className="tc-product-media">
      <video
        ref={videoRef}
        className="tc-product-video"
        src={product.video}
        poster={product.poster}
        aria-label={product.videoLabel}
        autoPlay
        muted
        loop
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <button
        className="tc-product-video-toggle"
        type="button"
        aria-label={`${isPlaying ? "Pause" : "Play"} video: ${product.videoLabel}`}
        onClick={togglePlayback}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
    </div>
  );
}

export function ProductShowcase() {
  return (
    <section className="tc-products" aria-labelledby="tc-products-title">
      <div className="tc-products-lead">
        <h2 id="tc-products-title">From mind to design in minutes</h2>
        <p>
          Discover the thrill of invention. Mix and match. Debug and learn. Give students the boost to pursue STEM careers with confidence.
        </p>
      </div>

      {products.map((product) => (
        <article className="tc-product-row" key={product.eyebrow}>
          <div className="tc-product-copy">
            <span className="tc-product-eyebrow">{product.eyebrow}</span>
            <h3 className="tc-product-title">{product.title}</h3>
            <p className="tc-product-description">{product.description}</p>
            <Link className="tc-button tc-product-cta" href={product.href}>
              {product.label}
            </Link>
          </div>

          <ProductVideo product={product} />
        </article>
      ))}
    </section>
  );
}

export default ProductShowcase;
