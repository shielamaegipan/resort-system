import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import './HomeGallery.css';

// Big pictures at the top (slideshow)
const HERO = [
  { src: '/images/home/hero-blue.jpg', alt: 'Resort pool lined with palm trees under a blue sky', title: 'Relax by the pool', text: 'Palm trees, sunshine and the sea a few steps away.' },
  { src: '/images/home/hero-white.jpg', alt: 'Turquoise lagoon seen from the resort pool', title: 'Where the lagoon meets the sky', text: 'Clear water, soft sand and slow mornings.' },
];

// Gallery pictures. To add more: put the file in public/images/home/ and add a line here.
const PHOTOS = [
  { src: '/images/home/gallery-3.jpg', alt: 'Palm trees and beach umbrellas by the sea', caption: 'Palm garden' },
  { src: '/images/home/gallery-1.jpg', alt: 'Palm fronds over the pool and lounge chairs', caption: 'Poolside' },
  { src: '/images/home/gallery-4.jpg', alt: 'Pool and lagoon with umbrellas', caption: 'The lagoon' },
  { src: '/images/home/gallery-6.jpg', alt: 'Pool with palm trees and turquoise water', caption: 'Turquoise water' },
  { src: '/images/home/gallery-2.jpg', alt: 'Lounge chairs along the pool', caption: 'Lounge area' },
  { src: '/images/home/gallery-5.jpg', alt: 'Pool pattern and beach umbrellas', caption: 'Infinity pool' },
];

export default function HomeGallery({ children, middle, after, maxPhotos = 8 }) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const reduceMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  // Room photos uploaded by the staff are added to the gallery automatically
  useEffect(() => {
    api('/rooms')
      .then((list) => setRooms(Array.isArray(list) ? list.filter((r) => r.image_url) : []))
      .catch(() => {});
  }, []);

  const all = [
    ...PHOTOS,
    ...rooms.map((r) => ({ src: r.image_url, alt: `${r.name}, ${r.type}`, caption: `${r.name} · ${r.type}` })),
  ];

  // Slideshow
  useEffect(() => {
    if (paused || reduceMotion.current || HERO.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % HERO.length), 5000);
    return () => clearInterval(t);
  }, [paused]);

  // Lightbox keys
  useEffect(() => {
    if (open === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % all.length);
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + all.length) % all.length);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, all.length]);

  const go = (n) => setSlide((slide + n + HERO.length) % HERO.length);

  return (
    <div className="hg">
      <section
        className="hg-hero"
        aria-roledescription="carousel"
        aria-label="Resort photos"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {HERO.map((h, i) => (
          <img key={h.src} src={h.src} alt={h.alt} className={`hg-slide${i === slide ? ' on' : ''}`} aria-hidden={i !== slide} />
        ))}
        <div className="hg-shade" />
        <div className="hg-text" aria-live="polite">
          <h2>{HERO[slide].title}</h2>
          <p>{HERO[slide].text}</p>
          {children && <div className="hg-actions">{children}</div>}
        </div>
        {HERO.length > 1 && (
          <>
            <button className="hg-arrow prev" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
            <button className="hg-arrow next" onClick={() => go(1)} aria-label="Next photo">›</button>
            <div className="hg-dots">
              {HERO.map((h, i) => (
                <button key={h.src} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} aria-label={`Show photo ${i + 1}`} />
              ))}
            </div>
          </>
        )}
      </section>

      {middle}

      <h2 className="hg-heading">Around the resort</h2>
      <div className="hg-grid">
        {(showAll ? all : all.slice(0, maxPhotos)).map((p, i) => (
          <button key={p.src + i} className="hg-tile" onClick={() => setOpen(i)} aria-label={`Open photo: ${p.caption}`}>
            <img src={p.src} alt={p.alt} loading="lazy" />
            <span>{p.caption}</span>
          </button>
        ))}
      </div>
      {all.length > maxPhotos && (
        <button className="hg-more" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer photos' : `Show all ${all.length} photos`}
        </button>
      )}

      {after}

      {open !== null && all[open] && (
        <div className="hg-lightbox" role="dialog" aria-modal="true" aria-label={all[open].caption} onClick={() => setOpen(null)}>
          <img src={all[open].src} alt={all[open].alt} onClick={(e) => e.stopPropagation()} />
          <p>{all[open].caption}</p>
          <button className="hg-close" onClick={() => setOpen(null)} aria-label="Close">×</button>
          {all.length > 1 && (
            <>
              <button className="hg-arrow prev" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + all.length) % all.length); }} aria-label="Previous photo">‹</button>
              <button className="hg-arrow next" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % all.length); }} aria-label="Next photo">›</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
