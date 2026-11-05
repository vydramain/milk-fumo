# rv_font: origin

`rv_font` is a 5x7 pixel font from pdklib. Its author is Andrey Vydra, the author of this
project. The site draws its interface with it: title bars, tabs, keys, lists, and the text
of notes.

On the site the font is stored as tables in `site/js/font_data.js`, exported as `RV_FONT`.
The tables were generated from the pdklib headers and the PxPlus IBM VGA 9x16 font.

## Where it is published

3dmppc-polymer: https://github.com/vydramain/3dmppc-polymer, directory
`pdk/lib/include/pdklib/rv_font/`, commit `8650afef`.

- `rv_font_data.hpp`: the bitmap font, bits; 5x7 ink inside an 8x8 cell.
- `rv_font_cyrillic.hpp`: the Cyrillic block, 66 glyphs in the same 5x7-in-8x8 design
  and bit layout, redrawn after PxPlus IBM VGA 9x16 (VileR, int10h.org).

## Cyrillic block and license

The Cyrillic block is an adaptation of PxPlus IBM VGA 9x16 and carries its license,
CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). The full license text is in
[`LICENSE`](../pxplus-ibm-vga/LICENSE), and the attribution is in
[`ORIGIN.md`](../pxplus-ibm-vga/ORIGIN.md).
