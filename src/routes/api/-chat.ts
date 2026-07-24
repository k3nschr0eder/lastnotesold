import { createServerFn } from "@tanstack/react-start";

/**
 * POST /api/chat — AI support chatbot.
 *
 * Body: { message: string }
 *
 * If OPENAI_API_KEY is set, forwards the message to OpenAI and returns the reply.
 * Otherwise returns a friendly offline message so the chat widget degrades gracefully.
 */

const OFFLINE_REPLY =
  "Chat support is coming soon! In the meantime, check our FAQ below or email support@lastnotesold.com.";

export const postChat = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { message?: string })
  .handler(async ({ data }) => {
    const message = (data.message || "").trim();
    if (!message) {
      return { reply: "I didn't catch that — could you rephrase?" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { reply: OFFLINE_REPLY };
    }

    try {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful support assistant for LastNoteSold, a real-time paper money pricing tool for live streamers on Whatnot, TikTok Live, and eBay Live. LastNoteSold pulls live pricing data from eBay Active listings, Greensheet/CPG dealer pricing, and Sold-Comps. Plans: Free (10 lookups/day, eBay only, 3 comps), Pro ($14.99/mo, + Greensheet CPG, 20 comps), Premier ($24.99/mo, + Sold-Comps, 20 comps). Keep answers concise and friendly.",
            },
            { role: "user", content: message },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const body = await openaiRes.json();
      const reply =
        body.choices?.[0]?.message?.content ||
        "Sorry, I couldn't process that. Try the FAQ below or email support@lastnotesold.com.";

      return { reply };
    } catch {
      return { reply: OFFLINE_REPLY };
    }
  });
