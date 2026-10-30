# Fonts

The prototypes use three pixel fonts. All three may be redistributed as part of this repository.

| File | Used for | Origin | License |
|---|---|---|---|
| `rvfont5x7.otf` | interface: title bars, tabs, keys, lists | built by [`tools/build_rvfont.py`](../../../tools/build_rvfont.py) from the `rv_font` 5x7 tables of pdklib in [3dmppc-polymer](https://github.com/vydramain/3dmppc-polymer) (`pdk/lib/include/pdklib/rv_font/`), ASCII and Cyrillic | CC BY-SA 4.0 (rv_font derived from PxPlus; the whole font is under CC BY-SA 4.0), [LICENSE.CC-BY-SA-4.0](LICENSE.CC-BY-SA-4.0) |
| `WineTahomaBit.ttf` | Markdown body text | Wine's Tahoma replacement (Larry Snyder, 2004, based on Bitstream Vera Sans), bitmap conversion by Xenthio; copied unmodified from vgui2-deck | LGPL-2.1-or-later, [LICENSE.LGPL-2.1](LICENSE.LGPL-2.1) |
| `PxPlus_IBM_VGA_9x16.ttf` | code blocks | [Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/) v2.2 by **VileR**; copied unmodified from vgui2-deck | CC BY-SA 4.0, [LICENSE.CC-BY-SA-4.0](LICENSE.CC-BY-SA-4.0) |

A pixel font only looks right at its native size or a whole multiple of it:
rv_font at 8 px (16, 24…), PxPlus at 16 px.
