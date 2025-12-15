import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

interface TocItem {
  id: string;
  title: string;
  level: number;
}

export default function DocsToc() {
  const tocItems = useSignal<TocItem[]>([]);
  const activeId = useSignal<string>("");

  // Extract headings from DOM on mount
  useEffect(() => {
    const article = document.querySelector(".doc-content");
    if (!article) return;

    const headings = article.querySelectorAll("h2, h3, h4");
    const items: TocItem[] = [];

    headings.forEach((heading) => {
      const id = heading.id || heading.textContent?.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-") || "";

      // Ensure heading has an ID for linking
      if (!heading.id && id) {
        heading.id = id;
      }

      if (id) {
        items.push({
          id,
          title: heading.textContent || "",
          level: parseInt(heading.tagName.charAt(1)),
        });
      }
    });

    tocItems.value = items;
  }, []);

  // Scroll spy - highlight active section
  useEffect(() => {
    if (tocItems.value.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeId.value = entry.target.id;
            break;
          }
        }
      },
      {
        rootMargin: "-80px 0px -80% 0px",
        threshold: 0,
      }
    );

    tocItems.value.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [tocItems.value]);

  if (tocItems.value.length === 0) {
    return null;
  }

  return (
    <aside class="toc">
      <div class="toc-header">On this page</div>
      <nav class="toc-nav">
        <ul class="toc-list">
          {tocItems.value.map((item) => (
            <li
              key={item.id}
              class={`toc-item toc-level-${item.level}`}
            >
              <a
                href={`#${item.id}`}
                class={`toc-link ${activeId.value === item.id ? "toc-link-active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  const element = document.getElementById(item.id);
                  if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "start" });
                    // Update URL hash without jumping
                    history.pushState(null, "", `#${item.id}`);
                    activeId.value = item.id;
                  }
                }}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <style>
        {`
        .toc {
          width: 220px;
          flex-shrink: 0;
          position: sticky;
          top: 85px;
          height: calc(100vh - 100px);
          overflow-y: auto;
          padding: 0 1rem;
        }

        .toc-header {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-dim, #6b6560);
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--border, rgba(255, 184, 111, 0.08));
        }

        .toc-nav {
          font-size: 0.8rem;
        }

        .toc-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .toc-item {
          margin: 0;
        }

        .toc-level-2 {
          padding-left: 0;
        }

        .toc-level-3 {
          padding-left: 0.75rem;
        }

        .toc-level-4 {
          padding-left: 1.5rem;
        }

        .toc-link {
          display: block;
          padding: 0.35rem 0;
          color: var(--text-muted, #a8a29e);
          text-decoration: none;
          transition: all 0.15s ease;
          border-left: 2px solid transparent;
          padding-left: 0.75rem;
          margin-left: -0.75rem;
        }

        .toc-link:hover {
          color: var(--text, #f0ede8);
        }

        .toc-link-active {
          color: var(--accent, #FFB86F);
          border-left-color: var(--accent, #FFB86F);
        }

        @media (max-width: 1280px) {
          .toc {
            display: none;
          }
        }
        `}
      </style>
    </aside>
  );
}
