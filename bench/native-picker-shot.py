"""Capture Chromium's native popup under Xvfb; page screenshots omit this X11 surface.

Only the top-left 520 x 360 pixels are needed: browser chrome and the E-16 model list.
Uses the environment's libX11 and Python standard library, with no installed package.
"""
import ctypes as c
import struct
import sys
import zlib
from pathlib import Path


class XImage(c.Structure):
    _fields_ = [
        ('width', c.c_int), ('height', c.c_int), ('xoffset', c.c_int), ('format', c.c_int),
        ('data', c.c_void_p), ('byte_order', c.c_int), ('bitmap_unit', c.c_int),
        ('bitmap_bit_order', c.c_int), ('bitmap_pad', c.c_int), ('depth', c.c_int),
        ('bytes_per_line', c.c_int), ('bits_per_pixel', c.c_int),
        ('red_mask', c.c_ulong), ('green_mask', c.c_ulong), ('blue_mask', c.c_ulong),
    ]


x = c.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [c.c_char_p]
x.XOpenDisplay.restype = c.c_void_p
x.XDefaultRootWindow.argtypes = [c.c_void_p]
x.XDefaultRootWindow.restype = c.c_ulong
x.XGetImage.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_int, c.c_uint, c.c_uint, c.c_ulong, c.c_int]
x.XGetImage.restype = c.POINTER(XImage)
x.XDestroyImage.argtypes = [c.POINTER(XImage)]
x.XCloseDisplay.argtypes = [c.c_void_p]
display = x.XOpenDisplay(None)
if not display:
    raise SystemExit('No X11 display: run with xvfb-run')
image = None
try:
    image = x.XGetImage(display, x.XDefaultRootWindow(display), 0, 0, 520, 360, c.c_ulong(-1).value, 2)
    if not image:
        raise SystemExit('XGetImage failed')
    info = image.contents
    if (info.bits_per_pixel, info.byte_order, info.red_mask, info.green_mask, info.blue_mask) != (32, 0, 0xff0000, 0xff00, 0xff):
        raise SystemExit('Expected Xvfb 24-bit BGRX display')
    data = c.string_at(info.data, info.bytes_per_line * info.height)
    rows = bytearray()
    for y in range(info.height):
        rows.append(0)  # PNG filter: none
        for col in range(info.width):
            offset = y * info.bytes_per_line + col * 4
            rows.extend((data[offset + 2], data[offset + 1], data[offset]))

    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))

    header = struct.pack('>IIBBBBB', info.width, info.height, 8, 2, 0, 0, 0)
    Path(sys.argv[1]).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
finally:
    if image:
        x.XDestroyImage(image)
    x.XCloseDisplay(display)
