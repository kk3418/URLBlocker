#!/usr/bin/env python3
"""生成 URL Blocker 擴充功能圖示（需要 Pillow 或使用 sips）"""

import struct
import zlib
import math

def create_png(size, bg_color, icon_char='🚫'):
    """建立簡單的純色 PNG 圖示（不依賴第三方庫）"""

    def make_chunk(chunk_type, data):
        chunk_len = struct.pack('>I', len(data))
        chunk_data = chunk_type + data
        chunk_crc = struct.pack('>I', zlib.crc32(chunk_data) & 0xffffffff)
        return chunk_len + chunk_data + chunk_crc

    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    ihdr = make_chunk(b'IHDR', ihdr_data)

    # Create pixel data
    r, g, b = bg_color
    raw_data = b''
    for y in range(size):
        raw_data += b'\x00'  # filter type none
        for x in range(size):
            # 圓角矩形
            margin = size // 8
            rx = margin  # corner radius

            # 計算是否在圓角矩形內
            dx = max(margin - x, 0, x - (size - margin - 1))
            dy = max(margin - y, 0, y - (size - margin - 1))
            in_shape = dx * dx + dy * dy <= rx * rx

            if in_shape:
                raw_data += bytes([r, g, b])
            else:
                # 透明（白色背景）
                raw_data += bytes([242, 242, 247])

    compressed = zlib.compress(raw_data, 9)
    idat = make_chunk(b'IDAT', compressed)
    iend = make_chunk(b'IEND', b'')

    return signature + ihdr + idat + iend


def main():
    import os

    # 紅色圖示（代表封鎖）
    bg_color = (255, 59, 48)  # iOS Red

    sizes = [16, 32, 48, 128]
    script_dir = os.path.dirname(os.path.abspath(__file__))

    for size in sizes:
        png_data = create_png(size, bg_color)
        filename = os.path.join(script_dir, f'icon-{size}.png')
        with open(filename, 'wb') as f:
            f.write(png_data)
        print(f'建立 {filename} ({size}x{size})')

    print('\n圖示建立完成！')


if __name__ == '__main__':
    main()
