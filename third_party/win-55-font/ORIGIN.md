# Win55 UI Bitmap Regular

`Win55-Regular-12.bdf` is the bitmap source from [win-55-ui beta-0.8.0, commit 37620e5c50044291e0c5cafd755677770a102362](https://github.com/OmskGameJam/win-55-ui/tree/37620e5c50044291e0c5cafd755677770a102362), at `src-font/LiberationSans-Regular-12.bdf`. It contains the 12-pixel glyphs derived from Liberation Sans 1.05.

Milk Fumo converts each horizontal run of bitmap pixels to a TrueType outline. The conversion preserves the glyph positions and advances. To regenerate `Win55-Regular-12.ttf`, run `python3 third_party/win-55-font/build.py` with fontTools installed. The browser supplies a sans-serif fallback for characters outside the bitmap source.

The font source and generated font are distributed under GPL v2 with the accompanying font exceptions. See [License.txt](License.txt), [GPL-2.0.txt](GPL-2.0.txt) and [AUTHORS](AUTHORS).
