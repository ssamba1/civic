/**
 * Per-navigation fade for resident (/user) sub-routes. The user layout (nav +
 * bottom tab bar) persists; only this content wrapper remounts per navigation,
 * replaying route-enter so each view fades in. Motion-guarded.
 */
export default function UserTemplate({ children }: { children: React.ReactNode }) {
  return <div className="route-enter flex flex-1 flex-col">{children}</div>;
}
