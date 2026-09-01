/**
 * Map-route shell. Exists only to emit the 3D-globe resource hints as early in
 * the streamed HTML as possible, a layout renders (and so flushes its hoisted
 * <link>s) ahead of the page body, which on this route sits behind ~0.5 MB of
 * flight data for the shared report corpus. Renders nothing of its own, so the
 * map view is byte-identical.
 *
 * The globe is the default renderer and pulls /cesium/Cesium.js (1.7 MB) plus
 * ion terrain/building tiles, but only once hydration has resolved the
 * report-map -> globe-map chunk chain. These hints start the same fetches from
 * the HTML instead. Scoped to this segment so no other city route pays for it.
 */
export default function MapRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preload" as="script" href="/cesium/Cesium.js" />
      <link rel="preload" as="style" href="/cesium/Widgets/widgets.css" />
      <link rel="preconnect" href="https://assets.ion.cesium.com" />
      <link rel="preconnect" href="https://api.cesium.com" />
      {children}
    </>
  );
}
