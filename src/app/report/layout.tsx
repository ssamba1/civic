// Route-segment config for /report. The submit server action runs the full
// classify pipeline (photo download + Gemini, with retries) inside the request,
// so the function needs headroom beyond Vercel's short default. 60s comfortably
// covers a slow Gemini call plus retry backoff. A pass-through layout — the page
// owns its own full-screen chrome.
export const maxDuration = 60;

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
