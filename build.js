import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import markdownIt from "markdown-it";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "_site");
const TIKZ_CACHE_DIR = path.join(ROOT, ".tikz-cache");
const TIKZ_OUT_DIR = path.join(OUT_DIR, "tikz");

const md = markdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: true
});

function mathBlock(state, startLine, endLine, silent) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const line = state.src.slice(start, max);
  if (!line.startsWith("$$")) return false;
  if (silent) return true;

  let nextLine = startLine;
  let found = false;
  let content = "";

  if (line.trim() !== "$$") {
    content = line.slice(2).trim();
    found = true;
  } else {
    nextLine++;
    for (; nextLine < endLine; nextLine++) {
      const s = state.bMarks[nextLine] + state.tShift[nextLine];
      const e = state.eMarks[nextLine];
      const l = state.src.slice(s, e);
      if (l.trim().startsWith("$$")) {
        found = true;
        break;
      }
      content += (content ? "\n" : "") + l;
    }
  }

  if (!found) return false;

  state.line = nextLine + 1;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = content.trim();
  token.map = [startLine, state.line];
  return true;
}

function mathInline(state, silent) {
  const start = state.pos;
  if (state.src[start] !== "$") return false;
  if (state.src[start + 1] === "$") return false;
  let pos = start + 1;
  while ((pos = state.src.indexOf("$", pos)) !== -1) {
    if (state.src[pos - 1] !== "\\") break;
    pos++;
  }
  if (pos === -1) return false;
  if (silent) return true;

  const token = state.push("math_inline", "math", 0);
  token.content = state.src.slice(start + 1, pos);
  state.pos = pos + 1;
  return true;
}

md.block.ruler.before("fence", "math_block", mathBlock, {
  alt: ["paragraph", "reference", "blockquote", "list"]
});
md.inline.ruler.before("escape", "math_inline", mathInline);

md.renderer.rules.math_block = (tokens, idx) => {
  return `<div class="math">$$\n${tokens[idx].content}\n$$</div>`;
};
md.renderer.rules.math_inline = (tokens, idx) => {
  return `$${tokens[idx].content}$`;
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function renderTikzToSvg(code) {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const hash = sha1(trimmed);
  const cachedSvg = path.join(TIKZ_CACHE_DIR, `${hash}.svg`);
  if (fs.existsSync(cachedSvg)) return cachedSvg;

  ensureDir(TIKZ_CACHE_DIR);
  const tmp = fs.mkdtempSync(path.join(TIKZ_CACHE_DIR, "tmp-"));
  const texPath = path.join(tmp, "tikz.tex");
  const pdfPath = path.join(tmp, "tikz.pdf");
  const svgPath = path.join(tmp, "tikz.svg");
  const tex = String.raw`\documentclass[tikz,border=2pt]{standalone}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{bm}
\usepackage{tikz}
\begin{document}
${trimmed}
\end{document}
`;
  fs.writeFileSync(texPath, tex, "utf8");
  execFileSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "-output-directory", tmp, texPath], {
    stdio: "ignore"
  });
  execFileSync("dvisvgm", ["--pdf", "--exact", "--font-format=woff2", "-o", svgPath, pdfPath], {
    stdio: "ignore"
  });
  fs.copyFileSync(svgPath, cachedSvg);
  fs.rmSync(tmp, { recursive: true, force: true });
  return cachedSvg;
}

// Render ```tikz blocks via build-time SVG
const fence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim() === "mermaid") {
    return `<pre class="mermaid">${escapeHtml(token.content)}</pre>`;
  }
  if (token.info.trim() === "tikz") {
    let code = token.content;
    code = code.replace(/\\begin\{document\}/g, "").replace(/\\end\{document\}/g, "");
    code = code.replace(/(^|[^\\])%.*$/gm, "$1");
    if (!code.trim()) return "";
    try {
      const svgPath = renderTikzToSvg(code);
      if (!svgPath) return "";
      const outPath = path.join(TIKZ_OUT_DIR, path.basename(svgPath));
      ensureDir(TIKZ_OUT_DIR);
      fs.copyFileSync(svgPath, outPath);
      return `<img class="tikz-svg" src="/tikz/${path.basename(svgPath)}" alt="tikz" />`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `<pre class="tikz-error">TikZ render failed: ${escapeHtml(message)}</pre>`;
    }
  }
  return fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

// Render video files as <video>
const image = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src") || "";
  if (/\.(mp4|webm)$/i.test(src)) {
    const alt = token.content || "video";
    return `<video class=\"manim-video\" controls preload=\"metadata\" aria-label=\"${escapeHtml(alt)}\"><source src=\"${src}\"></video>`;
  }
  return image ? image(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function slugifySegment(name) {
  return name.replace(/\s+/g, "-");
}

function slugifyFilename(filename) {
  return filename.replace(/\.md$/i, "").replace(/\s+/g, "-");
}

function buildTree(mdFiles) {
  const root = { name: "root", children: new Map(), files: [] };

  for (const file of mdFiles) {
    const rel = path.relative(CONTENT_DIR, file);
    const parts = rel.split(path.sep);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        node.files.push(part);
      } else {
        if (!node.children.has(part)) {
          node.children.set(part, { name: part, children: new Map(), files: [] });
        }
        node = node.children.get(part);
      }
    }
  }
  return root;
}

function renderTree(node, baseParts = [], depth = 0) {
  const dirs = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
  const files = node.files.slice().sort((a, b) => a.localeCompare(b));

  let html = "<ul class=\"tree\">";
  for (const dir of dirs) {
    const label = escapeHtml(dir.name);
    if (depth === 1) {
      html += `<li class="tree-dir"><details class="tree-folder"><summary class="tree-label">${label}</summary>`;
      html += renderTree(dir, baseParts.concat(dir.name), depth + 1);
      html += `</details></li>`;
    } else {
      html += `<li class=\"tree-dir\"><span class=\"tree-label\">${label}</span>`;
      html += renderTree(dir, baseParts.concat(dir.name), depth + 1);
      html += "</li>";
    }
  }
  for (const file of files) {
    const name = file.replace(/\.md$/i, "");
    const rel = baseParts.map(slugifySegment).concat(slugifyFilename(file)).join("/");
    html += `<li class=\"tree-file\"><a href=\"/${rel}.html\">${escapeHtml(name)}</a></li>`;
  }
  html += "</ul>";
  return html;
}

function extractTitle(text, fallback) {
  const match = text.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return fallback;
}

function cleanOutDir() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function copyPublic() {
  if (fs.existsSync(PUBLIC_DIR)) {
    fs.cpSync(PUBLIC_DIR, OUT_DIR, { recursive: true });
  }
  const assetsDir = path.join(ROOT, "assets");
  if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, path.join(OUT_DIR, "assets"), { recursive: true });
  }
}

function scriptTags() {
  const localMathjax = path.join(PUBLIC_DIR, "vendor", "mathjax", "tex-mml-chtml.js");
  const localTikzjax = path.join(PUBLIC_DIR, "vendor", "tikzjax", "tikzjax.js");
  const localTikzFonts = path.join(PUBLIC_DIR, "vendor", "tikzjax", "fonts.css");
  const hasLocal = fs.existsSync(localMathjax) && fs.existsSync(localTikzjax);
  const env = process.env.LOCAL_LIBS;
  const useLocal = env === "1" || (env !== "0" && hasLocal);

  if (useLocal) {
    const fonts = fs.existsSync(localTikzFonts)
      ? `\n    <link rel=\"stylesheet\" href=\"/vendor/tikzjax/fonts.css\" />`
      : "";
    return `${fonts}\n    <script src=\"/vendor/mathjax/tex-mml-chtml.js\" defer></script>\n    <script src=\"/vendor/tikzjax/tikzjax.js\" defer></script>`;
  }

  return `\n    <link rel=\"stylesheet\" href=\"https://tikzjax.com/v1/fonts.css\" />\n    <script src=\"https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js\" defer></script>\n    <script src=\"https://tikzjax.com/v1/tikzjax.js\" defer></script>`;
}

function renderPage({ title, body, treeHtml, scripts }) {
  const mathjaxConfig = `
    <script>
      window.MathJax = {
        tex: {
          inlineMath: [["$", "$"], ["\\\\(", "\\\\)"]],
          displayMath: [["$$", "$$"], ["\\\\[", "\\\\]"]],
          processEscapes: true,
          processEnvironments: true
        },
        options: {
          skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"]
        }
      };
    </script>`;
  const mermaidLoader = `
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true });
    </script>`;
  return `<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>${escapeHtml(title)}</title>
    <link rel=\"stylesheet\" href=\"/style.css\" />${mathjaxConfig}${scripts}
  </head>
  <body>
    <div class=\"layout\">
      <aside class=\"sidebar\">
        <div class=\"brand\">terminal_dogma</div>
        <nav class=\"nav\">
          ${treeHtml}
        </nav>
      </aside>
      <main class=\"content\">
        ${body}
      </main>
    </div>
    ${mermaidLoader}
    <script src=\"/app.js\"></script>
  </body>
</html>`;
}

function buildOnce() {
  const mdFiles = walk(CONTENT_DIR);
  const tree = buildTree(mdFiles);
  const treeHtml = renderTree(tree);
  const scripts = scriptTags();

  cleanOutDir();
  copyPublic();
  ensureDir(TIKZ_OUT_DIR);

  for (const file of mdFiles) {
    const rel = path.relative(CONTENT_DIR, file);
    const parts = rel.split(path.sep);
    const filename = parts.pop();
    const outRel = parts.map(slugifySegment).concat(slugifyFilename(filename)).join("/") + ".html";
    const outPath = path.join(OUT_DIR, outRel);
    const text = fs.readFileSync(file, "utf8");
    const title = extractTitle(text, path.basename(file, ".md"));
    const body = md.render(text);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderPage({ title, body, treeHtml, scripts }), "utf8");
  }

  // Root index redirects to content/index.md if present
  const indexMd = path.join(CONTENT_DIR, "index.md");
  const indexHtml = path.join(OUT_DIR, "index.html");
  if (!fs.existsSync(indexHtml) && fs.existsSync(indexMd)) {
    const text = fs.readFileSync(indexMd, "utf8");
    const title = extractTitle(text, "index");
    const body = md.render(text);
    fs.writeFileSync(indexHtml, renderPage({ title, body, treeHtml, scripts }), "utf8");
  }
}

function watch() {
  buildOnce();
  console.log("Watching content/ for changes...");
  fs.watch(CONTENT_DIR, { recursive: true }, () => {
    try {
      buildOnce();
      console.log("Rebuilt.");
    } catch (err) {
      console.error(err);
    }
  });
}

const args = process.argv.slice(2);
if (args.includes("--watch")) {
  watch();
} else {
  buildOnce();
}
