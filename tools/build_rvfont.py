# Builds a TTF of pdklib's 5x7 font (ASCII + Cyrillic) for the mockups:
# 8 px em, ascent the whole cell, every advance 6 px, as rv_editor_font_ttf does.
# Usage: python3 tools/build_rvfont.py <pdklib>/rv_font/rv_font_data.hpp <pdklib>/rv_font/rv_font_cyrillic.hpp out.otf cff
# (drop "cff" for a TrueType build). Needs fontTools.
import re
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1024
PX = UPM // 8
ADVANCE = 6 * PX


def table(path, name):
    src = open(path, encoding="utf-8").read()
    m = re.search(r"uint8_t\s+" + name + r"\s*\[[^\]]*\]\s*=\s*\{", src)
    body = src[m.end():src.index("};", m.end())]
    body = "\n".join(line.split("//")[0] for line in body.splitlines())
    return [int(h, 16) for h in re.findall(r"0x([0-9A-Fa-f]{2})", body)]


def draw(rows):
    pen = TTGlyphPen(None)
    for y, row in enumerate(rows):
        x = 0
        while x < 8:
            if not row & (0x80 >> x):
                x += 1
                continue
            start = x
            while x < 8 and row & (0x80 >> x):
                x += 1
            x0, x1 = start * PX, x * PX
            y1 = UPM - y * PX
            y0 = y1 - PX
            pen.moveTo((x0, y0))
            pen.lineTo((x0, y1))
            pen.lineTo((x1, y1))
            pen.lineTo((x1, y0))
            pen.closePath()
    return pen.glyph()


def draw_cff(rows):
    # CFF outer contours run counter-clockwise.
    pen = T2CharStringPen(ADVANCE, None)
    for y, row in enumerate(rows):
        x = 0
        while x < 8:
            if not row & (0x80 >> x):
                x += 1
                continue
            start = x
            while x < 8 and row & (0x80 >> x):
                x += 1
            x0, x1 = start * PX, x * PX
            y1 = UPM - y * PX
            y0 = y1 - PX
            pen.moveTo((x0, y0))
            pen.lineTo((x1, y0))
            pen.lineTo((x1, y1))
            pen.lineTo((x0, y1))
            pen.closePath()
    return pen.getCharString()


def main_cff(data_path, cyr_path, out_path):
    ascii_bits = table(data_path, "rv_font_bits")
    cyr_bits = table(cyr_path, "rv_font_cyrillic_bits")
    strings = {".notdef": draw_cff(ascii_bits[95 * 8:96 * 8])}
    cmap = {}
    for i in range(95):
        code = 32 + i
        name = "uni%04X" % code
        strings[name] = draw_cff(ascii_bits[i * 8:(i + 1) * 8])
        cmap[code] = name
    for slot in range(66):
        code = 0x0410 + slot if slot < 64 else (0x0401 if slot == 64 else 0x0451)
        name = "uni%04X" % code
        strings[name] = draw_cff(cyr_bits[slot * 8:(slot + 1) * 8])
        cmap[code] = name
    order = list(strings)
    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupCFF("rvfont5x7", {"FullName": "rvfont5x7"}, strings, {})
    fb.setupHorizontalMetrics({name: (ADVANCE, 0) for name in order})
    fb.setupHorizontalHeader(ascent=UPM, descent=0)
    fb.setupNameTable({"familyName": "rvfont5x7", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=UPM, sTypoDescender=0, sTypoLineGap=0, usWinAscent=UPM, usWinDescent=0)
    fb.setupPost()
    fb.save(out_path)
    print("cff glyphs", len(order), "->", out_path)


def main(data_path, cyr_path, out_path):
    ascii_bits = table(data_path, "rv_font_bits")
    cyr_bits = table(cyr_path, "rv_font_cyrillic_bits")
    assert len(ascii_bits) == 96 * 8, len(ascii_bits)
    assert len(cyr_bits) == 66 * 8, len(cyr_bits)

    glyphs = {".notdef": draw(ascii_bits[95 * 8:96 * 8])}
    cmap = {}
    for i in range(95):
        code = 32 + i
        name = "uni%04X" % code
        glyphs[name] = draw(ascii_bits[i * 8:(i + 1) * 8])
        cmap[code] = name
    for slot in range(66):
        code = 0x0410 + slot if slot < 64 else (0x0401 if slot == 64 else 0x0451)
        name = "uni%04X" % code
        glyphs[name] = draw(cyr_bits[slot * 8:(slot + 1) * 8])
        cmap[code] = name

    order = list(glyphs)
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font["glyf"]
    metrics = {}
    for name in order:
        g = glyf[name]
        g.recalcBounds(glyf)
        metrics[name] = (ADVANCE, getattr(g, "xMin", 0))
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=UPM, descent=0)
    fb.setupNameTable({"familyName": "rvfont5x7", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=UPM, sTypoDescender=0, sTypoLineGap=0, usWinAscent=UPM, usWinDescent=0)
    fb.setupPost()
    fb.save(out_path)
    print("glyphs", len(order), "->", out_path)


if __name__ == "__main__":
    if sys.argv[4:5] == ["cff"]:
        main_cff(*sys.argv[1:4])
    else:
        main(*sys.argv[1:4])
