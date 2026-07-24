import { useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/support")({
  component: SupportPage,
});

const faqs = [
  {
    q: "What is LastNoteSold?",
    a: "LastNoteSold is a real-time paper money pricing tool for live streamers on Whatnot, TikTok Live, and eBay Live. We pull live pricing data from eBay Active listings, Greensheet/CPG dealer pricing, and Sold-Comps (actual eBay sold prices) so you can price banknotes in seconds — right on stream.",
  },
  {
    q: "How does the free tier work?",
    a: "The Free tier gives you 10 lookups per day using eBay Active listing data (3 comps per search). It's a great way to try the service before upgrading.",
  },
  {
    q: "What data sources do Pro and Premier include?",
    a: "Pro ($14.99/mo) adds Greensheet CPG dealer pricing — the industry standard for retail paper money values, with 20 comps per search. Premier ($24.99/mo) adds Sold-Comps — actual eBay sold transaction prices so you can see what banknotes really sell for, not just what sellers are asking.",
  },
  {
    q: "How do I subscribe?",
    a: 'Click "Subscribe" on any tier from the pricing page. You\'ll be redirected to Stripe for secure checkout. After payment, you\'ll be returned to the site with your subscription active immediately.',
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes — all plans are month-to-month with no annual commitments. Cancel anytime through the Stripe Customer Portal. You'll retain access until the end of your billing period.",
  },
  {
    q: "What banknotes are covered?",
    a: "All major US paper money types including Large Size notes (Legal Tender, Silver Certificates, Gold Certificates, Federal Reserve Notes), Small Size notes ($1 to $100 denominations), Fractional Currency, and National Bank Notes. We're continuously expanding coverage.",
  },
  {
    q: "How do referrals work?",
    a: "Premier members get a unique referral code. Share your link with fellow streamers and dealers — when they click and subscribe to any paid plan, you earn a $5 bounty. Track your clicks, conversions, and earnings on your referrals dashboard.",
  },
  {
    q: "Is the pricing data accurate?",
    a: "We pull real-time data from industry-standard sources. Greensheet is the authoritative dealer pricing guide for US paper money, and Sold-Comps reflects actual eBay transactions. However, prices fluctuate — always use as a reference alongside your own judgment.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-800/40 transition-colors"
      >
        <span className="text-sm font-semibold text-white">{q}</span>
        <span className={`text-emerald-400 transition-transform text-lg ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      {open && (
        <div className="px-6 pb-4">
          <p className="text-sm text-gray-400 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

function ChatWidget() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: "Hi! I'm the LastNoteSold support assistant — here to help with paper money pricing. Ask me anything about our pricing tiers, data sources, banknote coverage, or how to get started with live streaming valuations." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: msg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "bot", text: data.reply || "Sorry, I couldn't process that." }]);
    } catch {
      setMessages(prev => [...prev, { role: "bot", text: "I'm having trouble connecting. Check the FAQ below or email support@lastnotesold.com for help." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center text-sm font-bold text-white">AI</div>
        <div>
          <p className="text-sm font-semibold text-white">Support Assistant</p>
          <p className="text-xs text-gray-500">Ask me anything</p>
        </div>
      </div>

      <div className="h-80 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
              m.role === "user"
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-200"
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-400">
              <span className="inline-flex gap-1">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>●</span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-800 px-4 py-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Type your question..."
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function SupportPage() {
  return (
    <div className="pt-24">
      {/* Hero */}
      <section className="border-b border-emerald-900/20 bg-gray-900/30 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold text-white sm:text-5xl">Support</h1>
          <p className="mt-4 text-lg text-gray-400">
            Find answers or ask our AI assistant for help.
          </p>
        </div>
      </section>

      {/* Chatbot */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Ask the Assistant</h2>
          <ChatWidget />
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 border-t border-emerald-900/20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Contact fallback */}
      <section className="py-16 border-t border-emerald-900/20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white mb-4">Still need help?</h2>
          <p className="text-gray-400 mb-6">
            Reach out directly and we'll get back to you as soon as possible.
          </p>
          <a
            href="mailto:support@lastnotesold.com"
            className="inline-flex rounded-xl bg-emerald-500 px-6 py-3 font-bold text-gray-950 hover:bg-emerald-400 transition-colors"
          >
            Email Support
          </a>
        </div>
      </section>
    </div>
  );
}
