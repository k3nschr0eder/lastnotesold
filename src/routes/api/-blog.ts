import { createServerFn } from "@tanstack/react-start";
import { getAllPosts, getFeaturedPosts, getPostBySlug } from "~/lib/blog";

export const blogAllPosts = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as {})
  .handler(async () => getAllPosts());
export const blogFeaturedPosts = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as {})
  .handler(async () => getFeaturedPosts());
export const blogPostBySlug = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { slug: string })
  .handler(async ({ data }) => getPostBySlug(data.slug));
