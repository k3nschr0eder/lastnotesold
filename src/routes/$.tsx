import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/$")({
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center pt-16 sm:pt-20">
      <div className="mx-auto max-w-md px-4 text-center">
        {/* Glitch-style 404 */}
        <p className="text-[80px] sm:text-[120px] font-black leading-none text-emerald-600/30 select-none">
          404
        </p>

        <h1 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
          Page Not Found
        </h1>

        <p className="mt-3 text-sm text-gray-400 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
          Double-check the URL or head back home.
        </p>

        <Link
          to="/"
          className="mt-8 inline-flex rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
