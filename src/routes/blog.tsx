import { createFileRoute, Outlet } from "@tanstack/react-router";
// Layout route for /blog — renders the matched child (listing at blog/index.tsx,
// article at blog/$slug.tsx). The child component renders inside <Outlet />.
export const Route = createFileRoute("/blog")({ component: BlogLayout });
function BlogLayout() {
  return <Outlet />;
}
