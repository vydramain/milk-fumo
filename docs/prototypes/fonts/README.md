# Шрифты

Прототипы используют три пиксельных шрифта. Все три можно распространять в составе репозитория.

| Файл | Где используется | Происхождение | Лицензия |
|---|---|---|---|
| `rvfont5x7.otf` | интерфейс: заголовки, вкладки, клавиши, списки | собран [`tools/build_rvfont.py`](../../../tools/build_rvfont.py) из таблиц `rv_font` 5x7 библиотеки pdklib в [3dmppc-polymer](https://github.com/vydramain/3dmppc-polymer) (`pdk/lib/include/pdklib/rv_font/`), ASCII и кириллица | не указана: в 3dmppc-polymer нет файла лицензии |
| `WineTahomaBit.ttf` | основной текст Markdown | замена Tahoma из Wine (Larry Snyder, 2004, на основе Bitstream Vera Sans), растровая версия от Xenthio; скопирован без изменений из vgui2-deck | LGPL-2.1-or-later, [LICENSE.LGPL-2.1](LICENSE.LGPL-2.1) |
| `PxPlus_IBM_VGA_9x16.ttf` | блоки кода | [Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/) v2.2, автор **VileR**; скопирован без изменений из vgui2-deck | CC BY-SA 4.0, [LICENSE.CC-BY-SA-4.0](LICENSE.CC-BY-SA-4.0) |

Пиксельный шрифт выглядит правильно только в родном размере или в целом кратном ему:
rv_font — 8 px (16, 24…), PxPlus — 16 px.
