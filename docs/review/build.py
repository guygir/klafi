#!/usr/bin/env python3
"""Build the one-by-one HTML review. Pitch C is last."""

from pathlib import Path
import re

import markdown

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
OUT = Path(__file__).resolve().parent

PAGES = [
    {
        "slug": "01-how-to-review",
        "title": "How to review",
        "why": "Order, what to look for, Pitch C last.",
        "kind": "md",
        "src": "docs/review/intro.md",
        "tag": "Start",
    },
    {
        "slug": "02-idea-inventory",
        "title": "Idea inventory",
        "why": "Everything we talked about — on the pitch or not.",
        "kind": "md",
        "src": "docs/product/idea-inventory.md",
        "tag": "Memory",
    },
    {
        "slug": "03-alignment",
        "title": "Product alignment",
        "why": "North star, audience, camps, security, jam goals.",
        "kind": "md",
        "src": "docs/product/alignment.md",
        "tag": "Product",
    },
    {
        "slug": "04-strategy",
        "title": "Strategy one-pager",
        "why": "What we can prove. Bait vs goal.",
        "kind": "md",
        "src": "docs/strategy/one-pager.md",
        "tag": "Strategy",
    },
    {
        "slug": "05-gdd",
        "title": "GDD lite",
        "why": "Loop, packs, rarity, camps, quiz, party pack, progression.",
        "kind": "md",
        "src": "docs/product/gdd-lite.md",
        "tag": "Product",
    },
    {
        "slug": "06-digital-collectibles",
        "title": "Digital collectibles",
        "why": "Pocket’s five takes. State Makers. What we invert.",
        "kind": "md",
        "src": "docs/product/digital-collectibles.md",
        "tag": "Product",
    },
    {
        "slug": "07-card-bible",
        "title": "Card bible",
        "why": "Anatomy, voice, neutrality, rarity language.",
        "kind": "md",
        "src": "docs/content/card-bible.md",
        "tag": "Writing",
    },
    {
        "slug": "08-poc-cards",
        "title": "PoC card backs",
        "why": "28 sourced cards. Three lists, equal skeleton.",
        "kind": "md",
        "src": "docs/content/poc-cards.md",
        "tag": "Writing",
    },
    {
        "slug": "09-quiz",
        "title": "Quiz items",
        "why": "Ten swipe questions. Progression = learning.",
        "kind": "md",
        "src": "docs/content/quiz.md",
        "tag": "Writing",
    },
    {
        "slug": "10-sources",
        "title": "Sources",
        "why": "Citations behind the cards and the pitch.",
        "kind": "md",
        "src": "docs/content/sources.md",
        "tag": "Evidence",
    },
    {
        "slug": "11-visual-system",
        "title": "Visual system",
        "why": "Tokens, frame, AI-art deadline, Weavy.",
        "kind": "md",
        "src": "docs/design/visual-system.md",
        "tag": "Design",
    },
    {
        "slug": "12-hero-cards",
        "title": "Hero cards",
        "why": "Flip the three finishes in the browser.",
        "kind": "iframe",
        "src": "../design/hero-cards.html",
        "tag": "Design",
    },
    {
        "slug": "13-wireframes",
        "title": "Phone wireframes",
        "why": "Home, rip, back, binder, quiz, energy.",
        "kind": "iframe",
        "src": "../design/wireframes.html",
        "tag": "Design",
    },
    {
        "slug": "14-implementation",
        "title": "Part 2 — how we build",
        "why": "HTML, server pulls, Weavy, agent skills.",
        "kind": "md",
        "src": "docs/implementation/part-2.md",
        "tag": "Build later",
    },
    {
        "slug": "15-citations",
        "title": "Citation card",
        "why": "Numbers you may say. Forbidden lines.",
        "kind": "md",
        "src": "docs/presentation/citations.md",
        "tag": "Evidence",
    },
    {
        "slug": "16-pitch-a",
        "title": "Pitch A — product brief",
        "why": "Reference only. Not the one you present.",
        "kind": "iframe",
        "src": "../presentation/index.html",
        "tag": "Reference",
    },
    {
        "slug": "17-pitch-a-notes",
        "title": "Pitch A — speaker notes",
        "why": "Reference.",
        "kind": "md",
        "src": "docs/presentation/speaker-notes.md",
        "tag": "Reference",
    },
    {
        "slug": "18-pitch-b",
        "title": "Pitch B — story only",
        "why": "Reference. No ask. Older spine.",
        "kind": "iframe",
        "src": "../presentation/story/index.html",
        "tag": "Reference",
    },
    {
        "slug": "19-pitch-b-notes",
        "title": "Pitch B — speaker notes",
        "why": "Reference.",
        "kind": "md",
        "src": "docs/presentation/story/speaker-notes.md",
        "tag": "Reference",
    },
    {
        "slug": "20-pitch-c-notes",
        "title": "Pitch C — speaker notes",
        "why": "Read these, then present. Asterisk is here only.",
        "kind": "md",
        "src": "docs/presentation/pitch/speaker-notes.md",
        "tag": "Present",
    },
    {
        "slug": "21-pitch-c",
        "title": "Pitch C — present this",
        "why": "~10 min civic story. Arrow keys.",
        "kind": "iframe",
        "src": "../presentation/pitch/index.html",
        "tag": "Present",
    },
    {
        "slug": "22-pitch-d-notes",
        "title": "Pitch D — speaker notes",
        "why": "Long notes. Read these before presenting D.",
        "kind": "md",
        "src": "docs/presentation/pitch-d/speaker-notes.md",
        "tag": "Present",
    },
    {
        "slug": "23-pitch-d",
        "title": "Pitch D — product deck",
        "why": "Previous product deck. Superseded on neutrality by the PoC feedback decision.",
        "kind": "iframe",
        "src": "../presentation/pitch-d/index.html",
        "tag": "Previous",
    },
    {
        "slug": "24-poc-feedback",
        "title": "PoC feedback response",
        "why": "Current decision: walkout, advocacy program, audience impact, bootstrap.",
        "kind": "md",
        "src": "docs/product/poc-feedback-response.md",
        "tag": "Current",
    },
    {
        "slug": "25-bootstrap",
        "title": "Bootstrap playbook",
        "why": "Seed cohort, social artifacts, referral funnel, and failure tree.",
        "kind": "md",
        "src": "docs/growth/bootstrap-playbook.md",
        "tag": "Growth",
    },
    {
        "slug": "26-editorial-pipeline",
        "title": "Editorial pipeline",
        "why": "Source registry, statuses, human gates, and broad-to-sharp programming.",
        "kind": "md",
        "src": "docs/content/editorial-pipeline.md",
        "tag": "Content",
    },
    {
        "slug": "27-poc-demo-sequence",
        "title": "PoC guided demo sequence",
        "why": "The fixed six-card rehearsal, composition, narrative, and publication blockers.",
        "kind": "md",
        "src": "docs/content/poc-demo-sequence.md",
        "tag": "Demo",
    },
    {
        "slug": "28-poc-assets",
        "title": "PoC asset manifest",
        "why": "Core art inventory, generated-asset status, crops, and rights gates.",
        "kind": "md",
        "src": "docs/design/poc-asset-manifest.md",
        "tag": "Art",
    },
    {
        "slug": "29-poc-test-kit",
        "title": "PoC first test kit",
        "why": "Cohort, facilitator script, observations, diagnosis, and pass signals.",
        "kind": "md",
        "src": "docs/growth/poc-test-kit.md",
        "tag": "Test",
    },
    {
        "slug": "30-poc-v2-structure",
        "title": "PoC v2 — 49-card structure",
        "why": "Locked party skeleton, quote triplets, rarity allocation, and publication gates.",
        "kind": "md",
        "src": "docs/content/poc-set-structure-v2.md",
        "tag": "Next",
    },
    {
        "slug": "31-weave-production",
        "title": "Figma Weave production brief",
        "why": "Reusable portrait, pack-rip, rare-motion, binder-reference, and export workflow.",
        "kind": "md",
        "src": "docs/design/weave-production-brief.md",
        "tag": "Motion",
    },
    {
        "slug": "32-weave-member-prompts",
        "title": "Weave member prompt library",
        "why": "Copy-ready three-portrait prompts and sourced quote context for all 12 PoC politicians.",
        "kind": "iframe",
        "src": "../design/weave-member-prompts.html",
        "tag": "Art",
    },
    {
        "slug": "32b-platform-excerpts",
        "title": "PoC v2 platform excerpts",
        "why": "Six exact platform-card texts with document labels, translations, context, and source limitations.",
        "kind": "md",
        "src": "docs/content/poc-v2-platform-excerpts.md",
        "tag": "Content",
    },
    {
        "slug": "33-poc-implementation",
        "title": "PoC implementation review",
        "why": "Historical map for the retired 28-card Alpha.",
        "kind": "md",
        "src": "docs/product/poc-implementation-review.md",
        "tag": "History",
    },
    {
        "slug": "34-expanded-studio",
        "title": "Expanded PoC Content Studio",
        "why": "Current 14-party, 51-politician, 191-card implementation and operating map.",
        "kind": "md",
        "src": "docs/product/expanded-poc-content-studio-review.md",
        "tag": "Current",
    },
    {
        "slug": "35-expanded-content-audit",
        "title": "Expanded content audit",
        "why": "Generated source, blank-slot, evidence, CEC, and missing-art gates.",
        "kind": "md",
        "src": "docs/review/expanded-content-audit.md",
        "tag": "Audit",
    },
    {
        "slug": "34-poc-pitch-notes",
        "title": "PoC presentation — holding notes",
        "why": "Preserved now; build the actual deck later.",
        "kind": "md",
        "src": "docs/presentation/poc-pitch-notes.md",
        "tag": "Last",
        "last": True,
    },
]

MD = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists", "nl2br"])

SRC_TO_SLUG = {}
for page in PAGES:
    if page["kind"] == "md":
        SRC_TO_SLUG[page["src"]] = page["slug"]
        SRC_TO_SLUG[Path(page["src"]).name] = page["slug"]


def rewrite_links(html: str) -> str:
    def repl(match):
        href = match.group(1)
        text = match.group(2)
        if href.startswith("http") or href.startswith("#") or href.startswith("mailto:"):
            return match.group(0)
        clean = href.split("#")[0]
        name = Path(clean).name
        slug = SRC_TO_SLUG.get(clean) or SRC_TO_SLUG.get(name)
        if slug:
            return f'<a href="{slug}.html">{text}</a>'
        return match.group(0)

    return re.sub(r'<a href="([^"]+)">([^<]*)</a>', repl, html)


def nav_buttons(i: int, extra: str = "") -> str:
    prev_p = PAGES[i - 1] if i else None
    next_p = PAGES[i + 1] if i + 1 < len(PAGES) else None
    prev = (
        f'<a class="btn" id="prev-page" href="{prev_p["slug"]}.html">← {prev_p["title"]}</a>'
        if prev_p
        else '<span class="btn ghost">← Start</span>'
    )
    nxt_cls = "btn last" if next_p and next_p.get("last") else "btn primary"
    nxt = (
        f'<a class="{nxt_cls}" id="next-page" href="{next_p["slug"]}.html">Next: {next_p["title"]} →</a>'
        if next_p
        else '<a class="btn" id="next-page" href="index.html">Back to contents</a>'
    )
    return f'<div class="nav">{prev}{extra}{nxt}</div>'


def shell(title: str, inner: str, i: int, framed: bool = False) -> str:
    n = i + 1
    total = len(PAGES)
    page = PAGES[i]
    mark = (
        f'<button class="btn mark" type="button" data-slug="{page["slug"]}">Mark reviewed</button>'
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} · Kalpi review</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="review.css" />
</head>
<body>
  <header class="bar">
    <div>
      <div class="who">Kalpi · review 1 by 1</div>
      <div class="step">{n} / {total} · {page["title"]}</div>
    </div>
    {nav_buttons(i, mark)}
  </header>
  {inner}
  {"" if framed else f'<footer class="foot">{nav_buttons(i)}</footer>'}
  <script src="review.js"></script>
</body>
</html>
"""


def write(name: str, html: str) -> None:
    (OUT / name).write_text(html, encoding="utf-8")


def build_index() -> None:
    items = []
    for i, page in enumerate(PAGES, 1):
        last = " last" if page.get("last") else ""
        items.append(
            f"""<li>
  <a href="{page["slug"]}.html" data-slug="{page["slug"]}">
    <span class="n">{i:02d}</span>
    <span><span class="name">{page["title"]}</span><span class="why">{page["why"]}</span></span>
    <span class="tag{last}">{page["tag"]}</span>
  </a>
</li>"""
        )
    inner = f"""
  <main class="hub">
    <p class="who" style="letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:var(--civic);font-size:12px;">Kalpi · product review</p>
    <h1>Read these first.<br />Pitch C is last.</h1>
    <p class="lede">One page at a time. Mark what you finish. Do not open the final pitch until the rest is reviewed.</p>
    <p class="progress" id="hub-progress"></p>
    <p><a class="btn primary" href="{PAGES[0]["slug"]}.html">Start review →</a></p>
    <ol class="list">
      {"".join(items)}
    </ol>
  </main>
"""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kalpi review</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="review.css" />
</head>
<body>
  {inner}
  <script src="review.js"></script>
</body>
</html>
"""
    write("index.html", html)


def build_pages() -> None:
    for i, page in enumerate(PAGES):
        if page["kind"] == "md":
            src = ROOT / page["src"]
            MD.reset()
            body = rewrite_links(MD.convert(src.read_text(encoding="utf-8")))
            inner = f"<article>{body}</article>"
            html = shell(page["title"], inner, i)
        else:
            inner = f"""<div class="frame-wrap">
  <iframe src="{page["src"]}" title="{page["title"]}"></iframe>
</div>"""
            html = shell(page["title"], inner, i, framed=True)
        write(f'{page["slug"]}.html', html)


if __name__ == "__main__":
    build_index()
    build_pages()
    print(f"Wrote {len(PAGES)} pages + index → {OUT}")
