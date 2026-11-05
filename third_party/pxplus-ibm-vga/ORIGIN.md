# PxPlus IBM VGA 9x16

The IBM VGA 9x16 text-mode font, as glyph bit tables. The site draws text with them in two
places: the playing time in the player (at scale 2) and code blocks in notes (at scale 1).

The tables are exported as `VGA_9X16` from [`site/js/font_data.js`](../../site/js/font_data.js).
The TTF itself is not stored in this repository, only the tables taken from it.
The IBM EGA 8x14 font from the same pack is not used here.

| | |
| --- | --- |
| Upstream | http://int10h.org - The Ultimate Oldschool PC Font Pack |
| Author | VileR (outline version, 2020) |
| Version | `v2.2-2020-11` (the font's own name table) |
| Licence | CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) - full text in [`LICENSE`](LICENSE) |

Source: 3dmppc-polymer (https://github.com/vydramain/3dmppc-polymer), directory
`third_party/pxplus-ibm-vga/`, commit `8650afef`. The tables are made from the unmodified TTF;
no patches applied.

Attribution: "PxPlus IBM VGA 9x16" by VileR, http://int10h.org, licensed under
Creative Commons Attribution-ShareAlike 4.0 International
(https://creativecommons.org/licenses/by-sa/4.0/).

The Cyrillic block of the `rv_font` font is redrawn from this font and carries the same
licence; see [`../rv_font/ORIGIN.md`](../rv_font/ORIGIN.md).
