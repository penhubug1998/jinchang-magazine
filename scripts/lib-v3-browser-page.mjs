// Helpers for the browser regression suites.
//
// Those suites do not navigate to a real URL: they read a Reader/Studio page
// from disk, splice the CSS and JS into it, and push it into the browser with
// Page.setDocumentContent. That means every asset reference has to be matched
// textually, and the published pages carry a ?v=<version>-<content hash>
// cache-bust query (see scripts/build-v3.mjs). Exact-string replaces therefore
// stop matching the moment cache busting is introduced or an import changes
// shape, and they fail silently: the mock API is never installed, the module
// never executes, and the suite reports a misleading readiness timeout instead
// of a missing injection.
//
// These helpers keep the match anchored on the asset *name* so a query string
// or an extra import specifier cannot silently break the injection again.

const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Matches the tag that loads `file` from the page, tolerating a ?v= query and
// any additional attributes.
//   tag 'link'   -> <link ... href="./studio.css[?v=...]">
//   tag 'script' -> <script ... src="./studio.js[?v=...]"></script>
export function assetTagPattern(tag, file) {
  const name = escapeRe(file);
  const query = "(?:\\?[^\"]*)?";
  if (tag === "link") return new RegExp(`<link[^>]*href="\\./${name}${query}"[^>]*>`);
  if (tag === "script") return new RegExp(`<script[^>]*src="\\./${name}${query}"[^>]*></script>`);
  throw new Error(`assetTagPattern: unknown tag ${tag}`);
}

// Matches `import { ... } from './x.js';` regardless of which specifiers are
// imported, so adding an export to the module cannot turn the replace into a
// no-op that leaves an unresolvable specifier behind.
export function importPattern(specifier) {
  return new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*(["'])${escapeRe(specifier)}\\1;?`);
}

// A module the inlined bundle can import without a real filesystem URL.
export function dataModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(String(source), "utf8").toString("base64")}`;
}
