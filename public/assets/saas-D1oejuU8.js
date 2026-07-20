// Compatibility rescue for users who still have an old deployed HTML/JS
// referencing this removed chunk. The only safe action is to force a clean
// reload so the browser downloads the current LinkUp Studio bundle.
const reloadParam = "__linkup_reload";

async function clearOldRuntimeCaches() {
  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  } catch {
    // Best effort only.
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Best effort only.
  }
}

function reloadCurrentVersion() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(reloadParam, String(Date.now()));
    clearOldRuntimeCaches().finally(() => window.location.replace(url.toString()));
  } catch {
    window.location.reload();
  }
}

reloadCurrentVersion();

export default {};
