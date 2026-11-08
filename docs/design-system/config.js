// The site's config.js for the design system. The import map of index.html sends the site modules' './config.js' here;
// this file still reads the real one, which lies outside that scope. Only the content root differs: the fixtures
// next to this file instead of nginx's /content/.
export * from '../../site/js/config.js';
export const CONTENT_ROOT = new URL('content/', import.meta.url).pathname;
