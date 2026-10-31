# PDF Merger

A private, browser-only PDF merger for [phillip.byram.dev](https://phillip.byram.dev). Files never leave the visitor's device; PDF parsing and document creation happen in a Web Worker using [`pdf-lib`](https://pdf-lib.js.org/).

## Local development

```bash
npm install
npm run dev
```

Run the automated merge tests and production build with:

```bash
npm test
npm run build
```

The Vite build uses relative asset paths, so the contents of `dist/` can be hosted at any subpath on a static site.

## Privacy and limitations

- No PDF data is uploaded or persisted.
- Large PDFs are constrained by the visitor's available browser memory.
- Password-protected PDFs are not supported.
- Merging invalidates digital signatures.
- Document-level features such as outlines, forms, and attachments may not be preserved by page copying.

## License

MIT
