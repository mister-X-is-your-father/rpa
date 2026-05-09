#!/usr/bin/env python3
"""
画像加工スクリプト - ハイブリッド版
1. フラッドフィル: 確実な背景を特定 → 強制白化
2. rembg: アルファマット取得
3. Color Decontamination: 背景色の寄与を数学的に除去
4. フラッドフィル背景 + 白フチ領域 → 強制白（rembgの誤差を上書き）
"""
from PIL import Image
from rembg import remove
import numpy as np
from scipy import ndimage
from collections import deque
import sys

def flood_fill_bg(pixels, tolerance=45):
    """エッジからフラッドフィル。白フチも通過して背景に到達。"""
    h, w = pixels.shape[:2]
    corners = [pixels[2,2,:3].astype(float), pixels[2,w-3,:3].astype(float),
               pixels[h-3,2,:3].astype(float), pixels[h-3,w-3,:3].astype(float)]
    bg_color = np.median(corners, axis=0)

    diff = np.sqrt(np.sum((pixels[:,:,:3].astype(float) - bg_color) ** 2, axis=2))
    white_diff = np.sqrt(np.sum((pixels[:,:,:3].astype(float) - 255.0) ** 2, axis=2))

    visited = np.zeros((h, w), dtype=bool)
    bg_mask = np.zeros((h, w), dtype=bool)
    white_border = np.zeros((h, w), dtype=bool)  # 白フチ（背景からアクセス可能な白ピクセル）
    queue = deque()

    # エッジからシード
    for x in range(w):
        for y in [0, 1, h-2, h-1]:
            if not visited[y, x] and (diff[y,x] < tolerance or white_diff[y,x] < 80):
                queue.append((y, x))
                visited[y, x] = True
                if diff[y,x] < tolerance:
                    bg_mask[y,x] = True
                elif white_diff[y,x] < 80:
                    white_border[y,x] = True
    for y in range(h):
        for x in [0, 1, w-2, w-1]:
            if not visited[y, x] and (diff[y,x] < tolerance or white_diff[y,x] < 80):
                queue.append((y, x))
                visited[y, x] = True
                if diff[y,x] < tolerance:
                    bg_mask[y,x] = True
                elif white_diff[y,x] < 80:
                    white_border[y,x] = True

    while queue:
        cy, cx = queue.popleft()
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
            ny, nx = cy+dy, cx+dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny,nx]:
                visited[ny,nx] = True
                is_bg = diff[ny,nx] < tolerance
                is_white = white_diff[ny,nx] < 80
                if is_bg or is_white:
                    if is_bg:
                        bg_mask[ny,nx] = True
                    else:
                        white_border[ny,nx] = True
                    queue.append((ny,nx))

    # 背景に隣接する背景色っぽいピクセルも拾う
    bg_dilated = ndimage.binary_dilation(bg_mask, iterations=8)
    near_bg = (diff < 70) & bg_dilated & ~bg_mask
    bg_mask = bg_mask | near_bg

    return bg_mask, white_border, bg_color

def process_image(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    orig = np.array(img)
    w, h = img.size
    print(f"入力: {w}x{h}")

    # Step 1: フラッドフィルで背景と白フチを特定
    bg_mask, white_border, bg_color = flood_fill_bg(orig)
    print(f"背景色: RGB({int(bg_color[0])}, {int(bg_color[1])}, {int(bg_color[2])})")
    print(f"フラッドフィル背景: {np.sum(bg_mask)}px, 白フチ: {np.sum(white_border)}px")

    # Step 2: rembgでアルファマット
    fg = remove(img)
    alpha = np.array(fg)[:,:,3].astype(float) / 255.0
    print("rembg完了")

    # Step 3: Color Decontamination
    orig_f = orig[:,:,:3].astype(float)
    result = np.zeros((h, w, 3), dtype=float)
    for c in range(3):
        result[:,:,c] = orig_f[:,:,c] + (255.0 - bg_color[c]) * (1.0 - alpha)
    result = np.clip(result, 0, 255)

    # Step 4: フラッドフィルで確定した背景+白フチ → 強制白化
    # rembgが半透明にした緑ピクセルも確実に白になる
    force_white = bg_mask | white_border
    result[force_white] = [255, 255, 255]

    # Step 5: 境界のアンチエイリアス緑にじみも除去
    # force_whiteの境界3px以内で、背景色に近いピクセルも白に
    diff = np.sqrt(np.sum((orig[:,:,:3].astype(float) - bg_color) ** 2, axis=2))
    fw_dilated = ndimage.binary_dilation(force_white, iterations=3)
    boundary_bg = fw_dilated & ~force_white & (diff < 80)
    result[boundary_bg] = [255, 255, 255]

    result = result.astype(np.uint8)
    print("合成完了")

    composited = Image.fromarray(result, "RGB")

    # 正方形キャンバス
    margin = int(max(h, w) * 0.05)
    canvas_size = max(h, w) + margin * 2
    canvas = Image.new("RGB", (canvas_size, canvas_size), (255, 255, 255))
    x_offset = (canvas_size - w) // 2
    y_offset = (canvas_size - h) // 2
    canvas.paste(composited, (x_offset, y_offset))
    print(f"キャンバス: {canvas_size}x{canvas_size}")

    canvas.save(output_path, quality=95)
    print(f"出力: {output_path}")
    return True

if __name__ == "__main__":
    input_path = sys.argv[1] if len(sys.argv) > 1 else "/home/neo/rpa/screenshots/sample.png"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "/home/neo/rpa/screenshots/processed.png"
    process_image(input_path, output_path)
