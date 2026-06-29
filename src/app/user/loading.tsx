/* Local Suspense boundary for the /user/* tree. Kept (not deleted) so the
   root landing skeleton in app/loading.tsx never leaks onto resident routes,
   but renders nothing — no shimmer skeleton between pages. The persistent
   layout chrome (header + BottomTabBar) stays put while a route resolves; the
   content area simply swaps in when ready instead of flashing a skeleton. */
export default function UserLoading() {
  return null;
}
