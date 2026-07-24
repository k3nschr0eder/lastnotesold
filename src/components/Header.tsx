import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";

const SCROLL_THRESHOLD = 50;

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/referrals", label: "Referrals" },
  { to: "/support", label: "Support" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    };

    // Check initial scroll position
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 border-b border-emerald-900/30 bg-gray-950/90 backdrop-blur-md transition-all duration-300 ${
        scrolled ? "h-20 shadow-lg shadow-black/20" : "h-24"
      }`}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src="/LastNoteSoldLogo.png"
            alt="LastNoteSold"
            className="h-16 w-auto object-contain"
          />
        </Link>
        <nav className="flex items-center gap-6">
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
              className={`text-sm font-medium transition-all duration-300 ${
                scrolled ? "text-xs" : "text-sm"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
