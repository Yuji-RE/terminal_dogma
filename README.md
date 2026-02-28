# terminal_dogma

Minimal static site for research notes with MathJax, TikZ, Mermaid, and Manim.

## Tech stack (what each piece does)

- Node.js: build runner
- markdown-it: Markdown to HTML
- MathJax: TeX/LaTeX math rendering
- TikZ: build-time SVG via `pdflatex` + `dvisvgm`
- Mermaid: diagrams in Markdown code fences
- Manim: animations embedded as `mp4/webm`
- Nix (optional): dev shell with TeX toolchain

## Use

```bash
npm install
npm run build
```

Output goes to `_site/`.

## Notes

- Put Markdown in `content/`.
- Put videos in `assets/` and reference like `![alt](/assets/file.mp4)`.
- Use ```tikz code fences for TikZ.
- Use ```mermaid code fences for Mermaid.

## TikZ rendering (build-time SVG)

TikZ blocks are rendered to SVG during `npm run build` using `pdflatex` + `dvisvgm`.
Cached SVGs live in `.tikz-cache/` and are copied into `_site/tikz/`.

## Local libraries (optional)

If you want to avoid CDNs, place these files:

- `public/vendor/mathjax/tex-mml-chtml.js`
- `public/vendor/tikzjax/tikzjax.js`

The build will use local files if both exist. Force local with `LOCAL_LIBS=1` or force CDN with `LOCAL_LIBS=0`.

## NixOS dev shell

```bash
nix develop
```
