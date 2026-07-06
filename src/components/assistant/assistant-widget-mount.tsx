"use client";

import dynamic from "next/dynamic";

// Client-side mount for the assistant widget. `ssr: false` is only legal in a
// Client Component, and layout.tsx (Server Component) also exports the route
// segment config `dynamic`, which collides with the next/dynamic import there.
const AssistantWidget = dynamic(
  () =>
    import("@/components/assistant/assistant-widget").then(
      (m) => m.AssistantWidget,
    ),
  { ssr: false },
);

export default function AssistantWidgetMount() {
  return <AssistantWidget />;
}
