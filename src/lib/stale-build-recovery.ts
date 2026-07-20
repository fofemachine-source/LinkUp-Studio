const RELOAD_ATTEMPT_KEY = "linkup:stale-build-recovery:last-attempt";
const CACHE_BUSTER_PARAM = "__linkup_reload";
const RELOAD_GUARD_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "chunkloaderror",
  "loading chunk",
  "failed to load module script",
  "vite:preloaderror",
];

declare global {
  interface Window {
    __linkupStaleBuildRecoveryInstalled?: boolean;
  }
}

function stringifyError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name} ${error.message} ${error.stack ?? ""}`;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown; name?: unknown; stack?: unknown; reason?: unknown };
    return [
      maybeError.name,
      maybeError.message,
      maybeError.stack,
      maybeError.reason ? stringifyError(maybeError.reason) : undefined,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return String(error ?? "");
}

function isAssetScriptFailure(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof HTMLScriptElement || target instanceof HTMLLinkElement)) return false;
  const url = target instanceof HTMLScriptElement ? target.src : target.href;
  return /\/assets\/.+\.(js|css)(\?|$)/i.test(url);
}

function isStaleBuildError(error: unknown): boolean {
  const message = stringifyError(error).toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function shouldReloadNow(): boolean {
  const lastAttempt = Number(window.sessionStorage.getItem(RELOAD_ATTEMPT_KEY) ?? "0");
  return !Number.isFinite(lastAttempt) || Date.now() - lastAttempt > RELOAD_GUARD_MS;
}

function markReloadAttempt() {
  window.sessionStorage.setItem(RELOAD_ATTEMPT_KEY, String(Date.now()));
}

function removeReloadMarkerAfterHealthyBoot() {
  const clearMarker = () => {
    const lastAttempt = Number(window.sessionStorage.getItem(RELOAD_ATTEMPT_KEY) ?? "0");
    if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt > 2_500) {
      window.sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has(CACHE_BUSTER_PARAM)) {
      url.searchParams.delete(CACHE_BUSTER_PARAM);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  };

  if (document.readyState === "complete") {
    window.setTimeout(clearMarker, 1_000);
    return;
  }

  window.addEventListener("load", () => window.setTimeout(clearMarker, 1_000), { once: true });
}

async function clearRuntimeCaches() {
  const cacheApi = window.caches;
  if (cacheApi) {
    const keys = await cacheApi.keys();
    await Promise.all(keys.map((key) => cacheApi.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}

function showRecoveryOverlay(isRetry: boolean) {
  if (document.getElementById("linkup-stale-build-recovery")) return;

  const overlay = document.createElement("div");
  overlay.id = "linkup-stale-build-recovery";
  overlay.setAttribute("role", "alert");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 0%,rgba(245,158,11,.22),rgba(2,6,23,.92) 45%,rgba(2,6,23,.98));padding:24px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;";
  overlay.innerHTML = `
    <div style="width:min(92vw,460px);border:1px solid rgba(245,158,11,.28);background:rgba(15,23,42,.78);backdrop-filter:blur(18px);border-radius:28px;padding:28px;text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.45)">
      <div style="margin:0 auto 16px;display:grid;height:58px;width:58px;place-items:center;border-radius:20px;background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.35);color:#f59e0b;font-size:30px">↻</div>
      <h1 style="margin:0 0 10px;font-size:24px;line-height:1.15;font-weight:800">Atualizando o LinkUp Studio</h1>
      <p style="margin:0 0 22px;color:rgba(255,255,255,.76);font-size:15px;line-height:1.55">
        ${isRetry
          ? "Seu navegador ainda está segurando arquivos antigos. Clique abaixo para forçar uma atualização limpa."
          : "Uma nova versão foi publicada. Vamos carregar os arquivos atualizados automaticamente."}
      </p>
      <button id="linkup-stale-build-reload" style="width:100%;border:0;border-radius:16px;background:#f59e0b;color:#111827;padding:14px 18px;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 12px 30px rgba(245,158,11,.28)">
        Carregar versão atualizada
      </button>
      <p style="margin:14px 0 0;color:rgba(255,255,255,.48);font-size:12px">Isso não altera seus dados nem seu login.</p>
    </div>`;

  document.body?.appendChild(overlay);
  document.getElementById("linkup-stale-build-reload")?.addEventListener("click", () => {
    window.sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
    reloadWithFreshAssets();
  });
}

function reloadWithFreshAssets() {
  const url = new URL(window.location.href);
  url.searchParams.set(CACHE_BUSTER_PARAM, String(Date.now()));
  clearRuntimeCaches()
    .catch(() => undefined)
    .finally(() => window.location.replace(url.toString()));
}

function recoverFromStaleBuild(error: unknown, event?: Event) {
  event?.preventDefault?.();

  if (!shouldReloadNow()) {
    showRecoveryOverlay(true);
    return;
  }

  markReloadAttempt();
  showRecoveryOverlay(false);
  window.setTimeout(reloadWithFreshAssets, 250);
}

export function installStaleBuildRecovery() {
  if (typeof window === "undefined" || window.__linkupStaleBuildRecoveryInstalled) return;
  window.__linkupStaleBuildRecoveryInstalled = true;

  removeReloadMarkerAfterHealthyBoot();

  window.addEventListener("vite:preloadError", (event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    recoverFromStaleBuild(payload ?? event, event);
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleBuildError(event.reason)) recoverFromStaleBuild(event.reason, event);
  });

  window.addEventListener(
    "error",
    (event) => {
      if (isAssetScriptFailure(event) || isStaleBuildError((event as ErrorEvent).error ?? (event as ErrorEvent).message)) {
        recoverFromStaleBuild((event as ErrorEvent).error ?? event, event);
      }
    },
    true,
  );
}

export const STALE_BUILD_RECOVERY_INLINE_SCRIPT = `(()=>{const k="${RELOAD_ATTEMPT_KEY}",p="${CACHE_BUSTER_PARAM}",g=${RELOAD_GUARD_MS},m=["failed to fetch dynamically imported module","error loading dynamically imported module","importing a module script failed","unable to preload css","chunkloaderror","loading chunk","failed to load module script","vite:preloaderror"];function s(e){try{return typeof e=="string"?e:e&&typeof e=="object"?[e.name,e.message,e.stack,e.reason&&s(e.reason)].filter(Boolean).join(" "):String(e??"")}catch{return""}}function i(e){return m.some(t=>s(e).toLowerCase().includes(t))}function a(e){const t=e&&e.target,n=t&&(("src"in t&&t.src)||("href"in t&&t.href));return!!n&&/\\/assets\\/.+\\.(js|css)(\\?|$)/i.test(n)}function c(){try{const e=Number(sessionStorage.getItem(k)||"0");return!Number.isFinite(e)||Date.now()-e>g}catch{return true}}function d(){try{sessionStorage.setItem(k,String(Date.now()))}catch{}}async function l(){try{if("caches"in window){const e=await caches.keys();await Promise.all(e.map(t=>caches.delete(t)))}}catch{}try{if("serviceWorker"in navigator){const e=await navigator.serviceWorker.getRegistrations();await Promise.all(e.map(t=>t.unregister()))}}catch{}}function r(){const e=new URL(location.href);e.searchParams.set(p,String(Date.now()));l().finally(()=>location.replace(e.toString()))}function o(e){if(document.getElementById("linkup-stale-build-recovery"))return;const t=document.createElement("div");t.id="linkup-stale-build-recovery";t.setAttribute("role","alert");t.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.94);padding:24px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;";t.innerHTML='<div style="width:min(92vw,460px);border:1px solid rgba(245,158,11,.28);background:rgba(15,23,42,.86);border-radius:28px;padding:28px;text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.45)"><div style="margin:0 auto 16px;display:grid;height:58px;width:58px;place-items:center;border-radius:20px;background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.35);color:#f59e0b;font-size:30px">↻</div><h1 style="margin:0 0 10px;font-size:24px;line-height:1.15;font-weight:800">Atualizando o LinkUp Studio</h1><p style="margin:0 0 22px;color:rgba(255,255,255,.76);font-size:15px;line-height:1.55">'+(e?"Seu navegador ainda está segurando arquivos antigos. Clique abaixo para forçar uma atualização limpa.":"Uma nova versão foi publicada. Vamos carregar os arquivos atualizados automaticamente.")+'</p><button id="linkup-stale-build-reload" style="width:100%;border:0;border-radius:16px;background:#f59e0b;color:#111827;padding:14px 18px;font-size:15px;font-weight:800;cursor:pointer">Carregar versão atualizada</button><p style="margin:14px 0 0;color:rgba(255,255,255,.48);font-size:12px">Isso não altera seus dados nem seu login.</p></div>';document.body&&document.body.appendChild(t);document.getElementById("linkup-stale-build-reload")?.addEventListener("click",()=>{try{sessionStorage.removeItem(k)}catch{}r()})}function h(e,t){try{t&&t.preventDefault&&t.preventDefault()}catch{}if(!c()){o(true);return}d();o(false);setTimeout(r,250)}window.__linkupStaleBuildRecoveryInstalled||(window.__linkupStaleBuildRecoveryInstalled=true,addEventListener("vite:preloadError",e=>h(e.payload||e,e)),addEventListener("unhandledrejection",e=>{i(e.reason)&&h(e.reason,e)}),addEventListener("error",e=>{(a(e)||i(e.error||e.message))&&h(e.error||e,e)},true),addEventListener("load",()=>setTimeout(()=>{try{const e=Number(sessionStorage.getItem(k)||"0");Number.isFinite(e)&&Date.now()-e>2500&&sessionStorage.removeItem(k);const t=new URL(location.href);t.searchParams.has(p)&&(t.searchParams.delete(p),history.replaceState(history.state,"",t.toString()))}catch{}},1e3),{once:true}))})();`;
