import type { CSSProperties, ReactNode } from "react";
import {
  getBookingBrandingFrame,
  getPublicBrandingUrl,
  normalizeBookingBranding,
  type BookingBranding,
  type BookingBrandingInput,
  type BrandingViewport,
} from "@/lib/booking-branding";
import { cn } from "@/lib/utils";

type BrandingCssProperties = CSSProperties & {
  "--booking-mobile-position": string;
  "--booking-tablet-position": string;
  "--booking-desktop-position": string;
  "--booking-mobile-scale": number;
  "--booking-tablet-scale": number;
  "--booking-desktop-scale": number;
};

export type ImmersiveBackgroundProps = {
  branding?: BookingBrandingInput | null;
  fallbackUrl?: string | null;
  previewViewport?: BrandingViewport;
  className?: string;
  contentClassName?: string;
  imageClassName?: string;
  overlayClassName?: string;
  children?: ReactNode;
  alt?: string;
  priority?: boolean;
};

function resolveUrls(branding: BookingBranding, fallbackUrl?: string | null) {
  const fallback = getPublicBrandingUrl(fallbackUrl);
  const mobileCustom = getPublicBrandingUrl(branding.background_mobile_path);
  const tabletCustom = getPublicBrandingUrl(branding.background_tablet_path);
  const desktopCustom = getPublicBrandingUrl(branding.background_desktop_path);

  const mobile = mobileCustom ?? tabletCustom ?? desktopCustom ?? fallback;
  const tablet = tabletCustom ?? desktopCustom ?? mobileCustom ?? fallback;
  const desktop = desktopCustom ?? tabletCustom ?? mobileCustom ?? fallback;

  return { mobile, tablet, desktop };
}

function frameStyle(branding: BookingBranding): BrandingCssProperties {
  const mobile = getBookingBrandingFrame(branding, "mobile");
  const tablet = getBookingBrandingFrame(branding, "tablet");
  const desktop = getBookingBrandingFrame(branding, "desktop");

  return {
    "--booking-mobile-position": `${mobile.x}% ${mobile.y}%`,
    "--booking-tablet-position": `${tablet.x}% ${tablet.y}%`,
    "--booking-desktop-position": `${desktop.x}% ${desktop.y}%`,
    "--booking-mobile-scale": 1 + mobile.zoom,
    "--booking-tablet-scale": 1 + tablet.zoom,
    "--booking-desktop-scale": 1 + desktop.zoom,
  };
}

function previewImageStyle(branding: BookingBranding, viewport: BrandingViewport): CSSProperties {
  const frame = getBookingBrandingFrame(branding, viewport);
  const position = `${frame.x}% ${frame.y}%`;
  return {
    objectPosition: position,
    transformOrigin: position,
    transform: `scale(${1 + frame.zoom})`,
  };
}

export function ImmersiveBackground({
  branding: brandingInput,
  fallbackUrl,
  previewViewport,
  className,
  contentClassName,
  imageClassName,
  overlayClassName,
  children,
  alt = "",
  priority = true,
}: ImmersiveBackgroundProps) {
  const branding = normalizeBookingBranding(brandingInput);
  const urls = resolveUrls(branding, fallbackUrl);
  const previewUrl = previewViewport ? urls[previewViewport] : null;
  const hasResponsiveImage = Boolean(urls.mobile || urls.tablet || urls.desktop);
  const imageProps = {
    alt,
    decoding: "async" as const,
    loading: priority ? ("eager" as const) : ("lazy" as const),
    fetchPriority: priority ? ("high" as const) : ("auto" as const),
  };

  return (
    <div className={cn("relative isolate overflow-hidden bg-black", className)}>
      {previewViewport && previewUrl ? (
        <img
          {...imageProps}
          src={previewUrl}
          aria-hidden={alt ? undefined : true}
          className={cn(
            "absolute inset-0 z-0 h-full w-full object-cover will-change-transform",
            imageClassName,
          )}
          style={previewImageStyle(branding, previewViewport)}
        />
      ) : !previewViewport && hasResponsiveImage ? (
        <picture
          aria-hidden={alt ? undefined : true}
          className="absolute inset-0 z-0 block h-full w-full"
        >
          {urls.desktop && <source media="(min-width: 1280px)" srcSet={urls.desktop} />}
          {urls.tablet && <source media="(min-width: 768px)" srcSet={urls.tablet} />}
          <img
            {...imageProps}
            src={urls.mobile ?? urls.tablet ?? urls.desktop ?? undefined}
            className={cn(
              "h-full w-full object-cover will-change-transform",
              "[object-position:var(--booking-mobile-position)] [transform:scale(var(--booking-mobile-scale))] [transform-origin:var(--booking-mobile-position)]",
              "md:[object-position:var(--booking-tablet-position)] md:[transform:scale(var(--booking-tablet-scale))] md:[transform-origin:var(--booking-tablet-position)]",
              "xl:[object-position:var(--booking-desktop-position)] xl:[transform:scale(var(--booking-desktop-scale))] xl:[transform-origin:var(--booking-desktop-position)]",
              imageClassName,
            )}
            style={frameStyle(branding)}
          />
        </picture>
      ) : null}

      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 z-[1] bg-black", overlayClassName)}
        style={{ opacity: branding.overlay_opacity / 100 }}
      />

      {children !== undefined && (
        <div className={cn("relative z-10", contentClassName)}>{children}</div>
      )}
    </div>
  );
}
