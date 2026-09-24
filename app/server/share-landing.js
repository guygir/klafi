const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
});

export function requestOrigin(request) {
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = String(forwardedHost || request.headers.host || "klafi.vercel.app").split(",")[0].trim();
  const protoHeader = request.headers["x-forwarded-proto"];
  const local = host.includes("localhost") || host.startsWith("127.");
  const proto = String(protoHeader || (local ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}

export function escapeShareHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function writeShareHtml(request, response, html) {
  const body = Buffer.from(html, "utf8");
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=300",
    "content-length": body.length,
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

export function serveBinderShareLanding(request, response) {
  const origin = requestOrigin(request);
  const play = new URL("/", origin);
  play.searchParams.set("showcase", "1");
  const title = "קְלָפִי · האלבום המלא";
  const description = "תצוגה של כל האלבום, כולל ממוספרים אפשריים. אין כאן שחקן במשחק — בלי דירוג. ספירת המחזיקים אמיתית.";
  const shareUrl = `${origin}/share/binder`;
  const image = `${origin}/design-assets/hero-art-kalpi.png`;
  const playHref = `${play.pathname}${play.search}`;
  writeShareHtml(request, response, `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeShareHtml(title)}</title>
  <meta name="description" content="${escapeShareHtml(description)}" />
  <meta property="og:title" content="${escapeShareHtml(title)}" />
  <meta property="og:description" content="${escapeShareHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeShareHtml(shareUrl)}" />
  <meta property="og:image" content="${escapeShareHtml(image)}" />
  <meta property="og:image:alt" content="קְלָפִי · האלבום המלא" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeShareHtml(title)}" />
  <meta name="twitter:description" content="${escapeShareHtml(description)}" />
  <meta name="twitter:image" content="${escapeShareHtml(image)}" />
  <link rel="canonical" href="${escapeShareHtml(play.toString())}" />
  <meta http-equiv="refresh" content="0;url=${escapeShareHtml(playHref)}" />
</head>
<body>
  <p><a href="${escapeShareHtml(playHref)}">פתחו את האלבום המלא בקְלָפִי</a></p>
</body>
</html>`);
}

export function servePlayerBinderShareLanding(request, response, binder) {
  const origin = requestOrigin(request);
  const play = new URL("/", origin);
  play.searchParams.set("binder", binder.slug);
  const name = binder.displayName || "שחקן קְלָפִי";
  const title = `קְלָפִי · האלבום של ${name}`;
  const description = `${binder.ownedUnique || 0} קלפים שנאספו. תצוגה בלבד — בלי קוד שחזור.`;
  const shareUrl = `${origin}/share/u/${encodeURIComponent(binder.slug)}`;
  const image = `${origin}/design-assets/hero-art-kalpi.png`;
  const playHref = `${play.pathname}${play.search}`;
  writeShareHtml(request, response, `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeShareHtml(title)}</title>
  <meta name="description" content="${escapeShareHtml(description)}" />
  <meta property="og:title" content="${escapeShareHtml(title)}" />
  <meta property="og:description" content="${escapeShareHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeShareHtml(shareUrl)}" />
  <meta property="og:image" content="${escapeShareHtml(image)}" />
  <meta property="og:image:alt" content="${escapeShareHtml(title)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeShareHtml(title)}" />
  <meta name="twitter:description" content="${escapeShareHtml(description)}" />
  <meta name="twitter:image" content="${escapeShareHtml(image)}" />
  <link rel="canonical" href="${escapeShareHtml(play.toString())}" />
  <meta http-equiv="refresh" content="0;url=${escapeShareHtml(playHref)}" />
</head>
<body>
  <p><a href="${escapeShareHtml(playHref)}">פתחו את האלבום של ${escapeShareHtml(name)}</a></p>
</body>
</html>`);
}

export function serveShareLanding(request, response, card, extras = {}) {
  const origin = requestOrigin(request);
  const play = new URL("/", origin);
  play.searchParams.set("card", card.id);
  if (extras.ref) play.searchParams.set("ref", extras.ref);
  if (extras.gift) play.searchParams.set("gift", "1");
  const titleHe = card.titleHe || card.hebrewTitle || card.title || "קְלָפִי";
  const quote = String(card.walkout?.text || "").trim();
  const imagePath = card.artKey
    ? `/design-assets/${encodeURIComponent(card.artKey)}`
    : "/design-assets/hero-art-kalpi.png";
  const image = `${origin}${imagePath}`;
  const title = `קְלָפִי · ${titleHe}`;
  const description = quote || "אוספים את הבחירות.";
  const shareUrl = `${origin}/share/${encodeURIComponent(card.id)}`;
  const playHref = `${play.pathname}${play.search}`;
  writeShareHtml(request, response, `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeShareHtml(title)}</title>
  <meta name="description" content="${escapeShareHtml(description)}" />
  <meta property="og:title" content="${escapeShareHtml(title)}" />
  <meta property="og:description" content="${escapeShareHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeShareHtml(shareUrl)}" />
  <meta property="og:image" content="${escapeShareHtml(image)}" />
  <meta property="og:image:alt" content="${escapeShareHtml(titleHe)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeShareHtml(title)}" />
  <meta name="twitter:description" content="${escapeShareHtml(description)}" />
  <meta name="twitter:image" content="${escapeShareHtml(image)}" />
  <link rel="canonical" href="${escapeShareHtml(play.toString())}" />
  <meta http-equiv="refresh" content="0;url=${escapeShareHtml(playHref)}" />
</head>
<body>
  <p><a href="${escapeShareHtml(playHref)}">פתחו את הקלף בקְלָפִי</a></p>
</body>
</html>`);
}
