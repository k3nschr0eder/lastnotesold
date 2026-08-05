export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  read_time: string;
  image_url: string | null;
  body: string;
  published_at: string;
  featured: boolean;
}

type Row = Record<string, any>;
function config() {
  const url = process.env.TEAM_DB_URL;
  const token = process.env.TEAM_DB_AUTH_TOKEN;
  return url && token ? { url: url.replace("libsql://", "https://"), token } : null;
}
async function query(sql: string, params: string[] = []): Promise<Row[]> {
  const c = config(); if (!c) return [];
  try {
    const r = await fetch(c.url + "/v2/pipeline", { method: "POST", headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args: params.map(value => ({ type: "text", value })) } }, { type: "close" }] }) });
    const result = (await r.json()).results?.[0]?.response?.result;
    const cols = (result?.cols || []).map((x: any) => x.name);
    return (result?.rows || []).map((row: any[]) => Object.fromEntries(row.map((cell, i) => [cols[i], cell?.value])));
  } catch (e) { console.error("Blog query error", String(e).slice(0, 160)); return []; }
}
async function exec(sql: string, params: string[] = []) { await query(sql, params); }

const seed: Omit<BlogPost, "created_at">[] = [
  { id: "blog-red-seal-1928", slug: "what-makes-the-1928-2-red-seal-so-collectible", title: "What Makes the 1928 $2 Red Seal So Collectible?", description: "A closer look at the history, scarcity, and details that make this classic United States Note a collector favorite.", category: "Noteworthy Notes", read_time: "5 min read", image_url: null, featured: true, published_at: "2026-08-02", body: `The 1928 $2 Red Seal is one of the most recognizable notes in American paper money. Its bright red Treasury seal and compact small-size format make it an instant standout in any collection.\n\n## A new era for United States Notes\n\nThe 1928 series marked a major change in American currency. Notes became smaller, easier to handle, and more economical to produce. The $2 denomination continued to carry the portrait of Thomas Jefferson, while the red seal identified it as a United States Note.\n\n## What collectors look for\n\nCondition is the biggest factor in value. Crisp, original paper, strong corners, and an attractive serial number can all make a note more desirable. Star notes and scarce varieties add another layer of interest.\n\nAlways compare several sources before buying or selling. LastNoteSold brings active listings, dealer pricing, and sold comps together so you can make that comparison quickly.` },
  { id: "blog-market-trends-2026", slug: "paper-money-market-trends-whats-hot-in-2026", title: "Paper Money Market Trends: What's Hot in 2026", description: "From affordable small-size notes to high-grade rarities, here are the categories getting attention in today's market.", category: "Currency Currents", read_time: "4 min read", image_url: null, featured: true, published_at: "2026-07-20", body: `The paper money market in 2026 rewards knowledge and patience. Collectors are looking beyond headline rarities and finding opportunities in notes with strong history, eye appeal, and reasonable entry prices.\n\n## Three areas to watch\n\nSmall-size notes with unusual seals and serial numbers remain popular, especially when they are easy to explain on a live stream. High-grade silver certificates continue to attract collectors, while regional and national bank notes offer a deep story for specialists.\n\n## Price with real evidence\n\nAn asking price is not the same as a completed sale. Check active inventory alongside dealer guides and recent sold prices, then account for grade and originality. This balanced approach helps sellers set fair expectations and helps buyers spot a genuine opportunity.` },
  { id: "blog-grading-paper-money", slug: "the-great-debate-grading-paper-money-is-it-worth-it", title: "The Great Debate: Grading Paper Money — Is It Worth It?", description: "Professional grading can protect a note and make it easier to sell, but it is not the right choice for every piece.", category: "Noted", read_time: "6 min read", image_url: null, featured: false, published_at: "2026-07-08", body: `Should you send that note to a grading service? The answer depends on the note, its condition, and your goals.\n\n## When grading helps\n\nA scarce note in excellent condition can benefit from authentication, a standardized grade, and protective encapsulation. Grading may also make an important note easier for a buyer to evaluate remotely.\n\n## Do the math first\n\nFees, shipping, and turnaround time matter. For common circulated notes, the cost may exceed the value added. Compare the likely graded value with the complete cost of submission before sending anything away.\n\nWhether graded or raw, accurate pricing starts with good data and careful inspection.` }
];

let initialized = false;
async function ensureTable() {
  if (initialized || !config()) return;
  initialized = true;
  await exec(`CREATE TABLE IF NOT EXISTS blog_posts (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', read_time TEXT NOT NULL DEFAULT '5 min read', image_url TEXT, body TEXT NOT NULL, published_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), featured INTEGER NOT NULL DEFAULT 0)`);
  for (const p of seed) await exec("INSERT OR IGNORE INTO blog_posts (id,slug,title,description,category,read_time,image_url,body,published_at,featured) VALUES (?,?,?,?,?,?,?,?,?,?)", [p.id,p.slug,p.title,p.description,p.category,p.read_time,p.image_url || "",p.body,p.published_at,p.featured ? "1" : "0"]);
}
function map(row: Row): BlogPost { return { ...row, image_url: row.image_url || null, featured: Boolean(Number(row.featured)) }; }
export async function getAllPosts() { await ensureTable(); return (await query("SELECT * FROM blog_posts WHERE published_at <= datetime('now') ORDER BY published_at DESC")).map(map); }
export async function getFeaturedPosts(limit = 2) { await ensureTable(); return (await query("SELECT * FROM blog_posts WHERE featured = 1 AND published_at <= datetime('now') ORDER BY published_at DESC LIMIT ?", [String(limit)])).map(map); }
export async function getPostBySlug(slug: string) { await ensureTable(); const rows = await query("SELECT * FROM blog_posts WHERE slug = ? AND published_at <= datetime('now') LIMIT 1", [slug]); return rows[0] ? map(rows[0]) : null; }
