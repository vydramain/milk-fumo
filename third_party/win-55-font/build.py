# Build the browser font from the adjacent 12-pixel BDF using fontTools.
import re
from itertools import groupby
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

directory = Path(__file__).parent
source = (directory / "Win55-Regular-12.bdf").read_text()
units = 100
glyphs = {".notdef": TTGlyphPen(None).glyph()}
metrics = {".notdef": (6 * units, 0)}
encoding = {}

for block in re.findall(r"^STARTCHAR .*?\n(.*?)^ENDCHAR$", source, re.M | re.S):
    header, bitmap = block.split("BITMAP\n")
    fields = dict(line.split(" ", 1) for line in header.splitlines())
    code = int(fields["ENCODING"])
    advance, _ = map(int, fields["DWIDTH"].split())
    width, height, x, y = map(int, fields["BBX"].split())
    pen = TTGlyphPen(None)
    for row, hex_bits in enumerate(bitmap.splitlines()):
        bits = bin(int(hex_bits, 16))[2:].zfill(len(hex_bits) * 4)
        for ink, columns in groupby(enumerate(bits[:width]), key=lambda column: column[1]):
            columns = list(columns)
            if ink == "0":
                continue
            left = (x + columns[0][0]) * units
            right = (x + columns[-1][0] + 1) * units
            top = (y + height - row) * units
            bottom = top - units
            pen.moveTo((left, bottom))
            pen.lineTo((left, top))
            pen.lineTo((right, top))
            pen.lineTo((right, bottom))
            pen.closePath()
    name = f"uni{code:04X}"
    glyph = pen.glyph()
    glyph.recalcBounds(None)
    encoding[code] = name
    glyphs[name] = glyph
    metrics[name] = (advance * units, glyph.xMin)

assert len(encoding) == int(re.search(r"^CHARS (\d+)$", source, re.M)[1])
font = FontBuilder(12 * units)
font.setupGlyphOrder(list(glyphs))
font.setupCharacterMap(encoding)
font.setupGlyf(glyphs)
font.setupHorizontalMetrics(metrics)
font.setupHorizontalHeader(ascent=10 * units, descent=-2 * units)
font.setupNameTable({
    "familyName": "Win55 UI Bitmap",
    "styleName": "Regular",
    "uniqueFontIdentifier": "Win55UIBitmap-Regular",
    "fullName": "Win55 UI Bitmap Regular",
    "psName": "Win55UIBitmap-Regular",
    "copyright": "Copyright 2007 Red Hat, Inc.",
    "licenseDescription": "GNU GPL v2 with font exceptions. See the accompanying License.txt and GPL-2.0.txt.",
})
font.setupOS2(sTypoAscender=10 * units, sTypoDescender=-2 * units, usWinAscent=13 * units, usWinDescent=4 * units)
font.setupPost()
font.font.recalcTimestamp = False
font.font["head"].created = font.font["head"].modified = 2082844800
font.save(directory.parents[1] / "site/fonts/win55/Win55-Regular-12.ttf")
