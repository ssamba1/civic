/**
 * Per-navigation fade for city sub-routes (Teams / Map / Analytics). Templates
 * remount on every navigation, so the route-enter animation replays each time —
 * fading the loading skeleton and resolved content in. The parent [slug] layout
 * (CityHeader + its sliding nav pill) is NOT remounted, so the pill slides
 * between views while the content below cross-fades. Motion-guarded in globals.css.
 */
export default function CityTemplate({ children }: { children: React.ReactNode }) {
  return <div className="route-enter flex flex-1 flex-col">{children}</div>;
}
