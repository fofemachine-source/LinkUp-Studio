type PwaHeadLinks = {
  manifestHref?: string | null;
  faviconHref?: string | null;
  appleTouchIconHref?: string | null;
};

type PwaHeadOptions = PwaHeadLinks & {
  title: string;
  themeColor?: string | null;
  tenantSlug?: string | null;
};

function upsertDocumentMeta(
  selector: string,
  createElement: () => HTMLMetaElement,
  apply: (element: HTMLMetaElement) => void,
) {
  const existing = document.head.querySelector(selector);
  const element = existing instanceof HTMLMetaElement ? existing : createElement();
  apply(element);
  if (!existing) document.head.appendChild(element);
}

function upsertDocumentLink(selector: string, rel: string, href: string) {
  const existing = document.head.querySelector(selector);
  const element = existing instanceof HTMLLinkElement ? existing : document.createElement("link");
  element.rel = rel;
  element.href = href;
  if (!existing) document.head.appendChild(element);
}

export function syncPwaDocumentHead({
  title,
  themeColor,
  manifestHref,
  faviconHref,
  appleTouchIconHref,
  tenantSlug,
}: PwaHeadOptions) {
  if (typeof document === "undefined") return;

  document.title = title;

  upsertDocumentMeta(
    'meta[name="apple-mobile-web-app-title"]',
    () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "apple-mobile-web-app-title");
      return meta;
    },
    (meta) => meta.setAttribute("content", title),
  );

  upsertDocumentMeta(
    'meta[name="application-name"]',
    () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "application-name");
      return meta;
    },
    (meta) => meta.setAttribute("content", title),
  );

  if (themeColor) {
    upsertDocumentMeta(
      'meta[name="theme-color"]',
      () => {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        return meta;
      },
      (meta) => meta.setAttribute("content", themeColor),
    );
  }

  if (manifestHref) upsertDocumentLink('link[rel="manifest"]', "manifest", manifestHref);
  if (faviconHref) upsertDocumentLink('link[rel="icon"]', "icon", faviconHref);
  if (appleTouchIconHref) {
    upsertDocumentLink('link[rel="apple-touch-icon"]', "apple-touch-icon", appleTouchIconHref);
  }

  if (tenantSlug && window.location.pathname.startsWith("/app")) {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("tenant") !== tenantSlug) {
      currentUrl.searchParams.set("tenant", tenantSlug);
      window.history.replaceState(window.history.state, "", currentUrl);
    }
  }
}
