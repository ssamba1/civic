/**
 * Per-navigation fade for staff sub-routes. The staff layout (sidebar nav +
 * active-route highlight) persists; only this content wrapper remounts per
 * navigation, replaying route-enter so each view fades in. Motion-guarded.
 */
export default function StaffTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="route-enter flex flex-1 flex-col">{children}</div>;
}
