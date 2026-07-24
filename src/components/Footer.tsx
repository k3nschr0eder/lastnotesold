export default function Footer() {
  return (
    <footer className="border-t border-emerald-900/20 bg-gray-900/50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">💵</span>
              <span className="text-lg font-bold text-emerald-400">
                LastNoteSold
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-400">
              Real-time paper money pricing for live streamers.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-300">
              Quick Links
            </h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="/" className="transition-colors hover:text-emerald-400">Home</a>
              </li>
              <li>
                <a href="/pricing" className="transition-colors hover:text-emerald-400">Pricing</a>
              </li>
              <li>
                <a href="/referrals" className="transition-colors hover:text-emerald-400">Referrals</a>
              </li>
              <li>
                <a href="/support" className="transition-colors hover:text-emerald-400">Support</a>
              </li>
              <li>
                <a href="/about" className="transition-colors hover:text-emerald-400">About</a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-300">Legal</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="/privacy" className="transition-colors hover:text-emerald-400">Privacy Policy</a>
              </li>
              <li>
                <a href="/terms-of-service" className="transition-colors hover:text-emerald-400">Terms of Service</a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-300">
              Contact
            </h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <span className="transition-colors hover:text-emerald-400 cursor-pointer">
                  support@lastnotesold.com
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-emerald-900/20 pt-6 text-center text-xs text-gray-500">
          &copy; 2026 SixPackSouth, LLC. All rights reserved.
        </div>
      </div>
    </footer>
  );
}