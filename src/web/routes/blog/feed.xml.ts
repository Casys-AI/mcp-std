import { getPosts, type Post } from "../../utils/posts.ts";

const SITE_URL = "https://pml.casys.ai";
const FEED_TITLE = "Casys PML - Procedural Memory Layer Blog";
const FEED_DESCRIPTION =
  "Engineering insights, technical deep-dives, and lessons learned building Casys PML - a Procedural Memory Layer for AI agents.";
const FEED_AUTHOR = "Casys AI Team";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateAtomFeed(posts: Post[]): string {
  const now = new Date().toISOString();
  const latestUpdate = posts.length > 0 ? posts[0].date.toISOString() : now;

  const entries = posts.map((post) => `
  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${SITE_URL}/blog/${post.slug}" rel="alternate" type="text/html"/>
    <id>${SITE_URL}/blog/${post.slug}</id>
    <published>${post.date.toISOString()}</published>
    <updated>${post.date.toISOString()}</updated>
    <author>
      <name>${escapeXml(post.author)}</name>
    </author>
    <summary type="text">${escapeXml(post.snippet)}</summary>
    <content type="html"><![CDATA[${post.html}]]></content>
    ${post.tags.map((tag) => `<category term="${escapeXml(tag)}"/>`).join("\n    ")}
  </entry>`).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(FEED_TITLE)}</title>
  <subtitle>${escapeXml(FEED_DESCRIPTION)}</subtitle>
  <link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="${SITE_URL}/blog" rel="alternate" type="text/html"/>
  <id>${SITE_URL}/blog</id>
  <updated>${latestUpdate}</updated>
  <author>
    <name>${escapeXml(FEED_AUTHOR)}</name>
    <uri>${SITE_URL}</uri>
  </author>
  <generator uri="https://fresh.deno.dev/">Fresh</generator>
${entries}
</feed>`;
}

export const handler = {
  async GET(_req: Request): Promise<Response> {
    try {
      const posts = await getPosts();
      const feed = generateAtomFeed(posts);

      return new Response(feed, {
        headers: {
          "Content-Type": "application/atom+xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (error) {
      console.error("Error generating RSS feed:", error);
      return new Response("Error generating feed", { status: 500 });
    }
  },
};
