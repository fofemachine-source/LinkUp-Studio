import { useEffect, useRef, useState } from "react";

// Lightweight QR renderer using external CDN qrcode-generator (loaded once)
declare global {
  interface Window { qrcode?: any }
}

function loadQrcode(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
    s.onload = () => resolve(window.qrcode);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadQrcode().then((qr) => {
      if (cancelled || !qr || !ref.current) return;
      const q = qr(0, "M");
      q.addData(value);
      q.make();
      ref.current.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      const svg = ref.current.querySelector("svg");
      if (svg) { svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size)); }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [value, size]);
  return <div ref={ref} className="bg-white rounded-lg p-2 inline-block" style={{ minWidth: size, minHeight: size }}>{!ready && <div className="text-xs text-muted-foreground">Gerando QR…</div>}</div>;
}
