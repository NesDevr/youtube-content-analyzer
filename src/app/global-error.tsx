"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen p-8">
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-gray-400 mb-6">
            {error.message || "A critical error occurred."}
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-white text-black rounded-md font-medium hover:bg-gray-200"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
