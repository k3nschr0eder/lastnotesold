import { useState, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";

const SCROLL_THRESHOLD = 50;

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/blog", label: "Blog" },
  { to: "/referrals", label: "Referrals" },
  { to: "/overlays", label: "Overlays" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/support", label: "Support" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menu on route change (when Link is clicked)
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 border-b border-emerald-900/30 bg-gray-950/90 backdrop-blur-md transition-all duration-300 ${
        scrolled ? "h-14 sm:h-16 shadow-lg shadow-black/20" : "h-16 sm:h-20"
      }`}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 shrink-0" onClick={closeMenu}>
          <img
            src="/LastNoteSoldLogo.png"
            alt="LastNoteSold"
            className="h-8 sm:h-12 w-auto object-contain"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-5">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeProps={{
                className: "text-emerald-400 font-semibold",
              }}
              inactiveProps={{
                className: "text-gray-300 hover:text-emerald-400 transition-colors",
              }}
              className="text-sm font-medium transition-all duration-300"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden flex items-center justify-center w-10 h-10 rounded-lg text-gray-300 hover:text-emerald-400 transition-colors"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="sm:hidden fixed inset-0 top-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeMenu}
          />
          {/* Menu panel */}
          <nav className="absolute top-[calc(4rem+1px)] sm:top-[calc(5rem+1px)] left-0 right-0 bg-gray-950/95 backdrop-blur-md border-b border-emerald-900/30 shadow-2xl">
            {navLinks.map((link, i) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                activeProps={{
                  className: "text-emerald-400 font-semibold bg-emerald-950/30",
                }}
                inactiveProps={{
                  className: "text-gray-300 hover:text-emerald-400 hover:bg-gray-900/50",
                }}
                className={`block px-6 py-3.5 text-base font-medium transition-colors ${
                  i < navLinks.length - 1 ? "border-b border-gray-800/50" : ""
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
