/**
 * Hero banner.
 *
 * A hand-rolled `<picture>` rather than `next/image` because the art is a fixed
 * decorative background: the browser picks AVIF or WebP from `srcset` at the
 * density it needs, and no runtime resizing is required.
 *
 * There is no `<link rel="preload">` for this image. The `<picture>` is part of
 * the initial HTML so the preload scanner finds the AVIF source on its own, and a
 * separate preload link resolves its URL independently of the `<picture>` - any
 * difference in `sizes` or format negotiation made the browser download both the
 * preloaded frame and the real one. `fetchPriority` on the `<img>` carries the
 * priority hint instead.
 */

const SIZES = [800, 1200, 1600, 2400] as const;

/**
 * The banner lives inside a `max-w-5xl` (1024px) column, so it never renders
 * wider than 1024px however large the viewport is. Declaring that ceiling keeps
 * wide screens from fetching the 2400px frame they cannot use, and phones from
 * being handed a desktop-sized file.
 */
const SIZES_ATTR = '(max-width: 1088px) 100vw, 1024px';

const AVIF_SRCSET = SIZES.map((width) => `/img/banner-${width}.avif ${width}w`).join(', ');
const WEBP_SRCSET = SIZES.map((width) => `/img/banner-${width}.webp ${width}w`).join(', ');

export interface HeroBannerProps {
  /** Copy rendered over the image. */
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
}

export function HeroBanner({ eyebrow, title, subtitle }: HeroBannerProps): React.JSX.Element {
  return (
    <section className="relative isolate overflow-hidden rounded-card shadow-card">
      <picture>
        <source type="image/avif" srcSet={AVIF_SRCSET} sizes={SIZES_ATTR} />
        <source type="image/webp" srcSet={WEBP_SRCSET} sizes={SIZES_ATTR} />
        <img
          src="/img/banner.png"
          alt=""
          aria-hidden="true"
          width={1200}
          height={500}
          // Above the fold and decorative: fetch eagerly at high priority so it
          // does not compete with the search form for the first paint.
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
      </picture>

      {/* A left-to-right scrim keeps the copy legible over any part of the art. */}
      <div
        aria-hidden="true"
        className="from-slate-950/85 via-slate-950/60 absolute inset-0 -z-10 bg-gradient-to-r to-transparent"
      />

      <div className="flex flex-col gap-3 px-6 py-14 sm:px-12 sm:py-20 lg:py-24">
        <p className="text-xs font-semibold tracking-[0.18em] text-amber-300 uppercase">
          {eyebrow}
        </p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        <p className="max-w-xl text-sm text-slate-200 sm:text-base">{subtitle}</p>
      </div>
    </section>
  );
}
