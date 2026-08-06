export function isBookingSurfacePath(pathname: string) {
  const normalized = String(pathname || "").replace(/\/+$/, "") || "/";
  return normalized === "/booking" || normalized.startsWith("/booking/");
}
