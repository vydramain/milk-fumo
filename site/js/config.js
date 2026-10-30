// Site settings. Paths of the notes the start screen shows are relative to the content root: the directory
// that docker-compose mounts as /srv/content. CONTENT_URL is the address at which nginx serves that directory.

// Address of the content root; nginx maps it to /srv/content (alias in nginx.conf).
// Kept here with the other settings so the URL is not duplicated in the modules that fetch files.
export const CONTENT_URL = '/content/';

// Left tile: the Home note, "who I am and what is here".
export const HOME_NOTE = 'home.md';

// Right tile, focused at start: the Tutorial note, "how it works".
export const TUTORIAL_NOTE = 'tutorial.md';
