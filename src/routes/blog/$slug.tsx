import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPostBySlug } from "~/lib/blog";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await getPostBySlug(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] };
    const post = loaderData;
    const url = `https://www.lastnotesold.com/blog/${post.slug}`;
    const title = `${post.title} — LastNoteSold Blog`;
    return {
      title,
      meta: [
        { name: "description", content: post.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:title", content: title },
        { property: "og:description", content: post.description },
        { property: "og:site_name", content: "LastNoteSold" },
        { property: "article:published_time", content: post.published_at },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: post.description },
        { name: "twitter:site", content: "@lastnotesold" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.description,
            url,
            datePublished: post.published_at,
            author: { "@type": "Organization", name: "LastNoteSold" },
            publisher: {
              "@type": "Organization",
              name: "SixPackSouth, LLC",
            },
          }),
        },
      ],
    };
  },
  component: ArticlePage,
});

function date(value: string) {
  return new Date(value + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Markdown({ body }: { body: string }) {
  return (
    <div className="space-y-5 text-lg leading-relaxed text-gray-300">
      {body.split("\n\n").map((block, i) =>
        block.startsWith("## ") ? (
          <h2 key={i} className="pt-5 text-2xl font-bold text-white">
            {block.slice(3)}
          </h2>
        ) : (
          <p key={i}>{block}</p>
        ),
      )}
    </div>
  );
}

function ArticlePage() {
  const post = Route.useLoaderData();
  return (
    <div className="pt-16 sm:pt-20">
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
        <a
          href="/blog"
          className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
        >
          ← Back to the blog
        </a>
        <div className="mt-10">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-full bg-emerald-900/60 px-3 py-1 font-semibold text-emerald-300">
              {post.category}
            </span>
            <span className="text-gray-500">
              {date(post.published_at)} · {post.read_time}
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {post.title}
          </h1>
          <p className="mt-5 text-xl leading-relaxed text-gray-400">
            {post.description}
          </p>
        </div>
        <div className="my-10 h-1 rounded-full bg-gradient-to-r from-emerald-600 to-transparent" />
        <Markdown body={post.body} />
      </article>
    </div>
  );
}
