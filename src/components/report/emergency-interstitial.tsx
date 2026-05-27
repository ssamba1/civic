"use client";

interface EmergencyInterstitialProps {
  onOverride: () => void;
}

export default function EmergencyInterstitial({
  onOverride,
}: EmergencyInterstitialProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-600 px-6 text-center">
      {/* Warning icon */}
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/20">
        <svg
          className="h-14 w-14 text-white"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">
        This appears to be an emergency
      </h1>
      <p className="text-white/80 text-base mb-10 max-w-xs">
        Our AI detected a potentially dangerous situation. If someone is in
        danger, please call 911 immediately.
      </p>

      {/* Call 911 button */}
      <a
        href="tel:911"
        className="w-full max-w-xs rounded-full bg-white py-4 text-center text-lg font-bold text-red-600 shadow-lg active:scale-95 transition-transform mb-4"
      >
        Call 911
      </a>

      {/* Override */}
      <button
        type="button"
        onClick={onOverride}
        className="w-full max-w-xs rounded-full border-2 border-white/40 py-3.5 text-center text-sm font-semibold text-white active:bg-white/10 transition-colors"
      >
        This is not an emergency
      </button>
    </div>
  );
}
