#!/usr/bin/env python3
"""Generate placeholder PNG icons for Tauri. Replace with real artwork before release."""
import struct
import zlib
import pathlib


def make_png(path: str, size: int, color: tuple = (41, 128, 185)):
    w = h = size
    # Each scanline: filter byte 0x00 + RGBA pixels (Tauri requires RGBA)
    row = b'\x00' + bytes((*color, 255)) * w
    raw = row * h
    compressed = zlib.compress(raw, 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA (color type 6)

    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', compressed))
        f.write(chunk(b'IEND', b''))
    print(f"  created {path} ({size}x{size})")


if __name__ == '__main__':
    print("Generating placeholder icons...")
    make_png('src-tauri/icons/32x32.png', 32)
    make_png('src-tauri/icons/128x128.png', 128)
    make_png('src-tauri/icons/128x128@2x.png', 256)
    print("Done. Replace with real artwork before release.")
