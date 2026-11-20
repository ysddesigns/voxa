"""
Voxa app icons, drawn from code so every size stays sharp.

Run:  python scripts/make-icons.py        (writes into assets/)

Store rules this follows
- iOS (App Store): one 1024x1024 PNG, square, opaque, no rounded corners
  (iOS applies the mask). iOS 18+ also takes a dark variant (transparent
  background, the system draws a dark one) and a tinted variant (grayscale on
  transparent; the system applies the user's tint).
- Android (adaptive icon, Android 8+): 108dp canvas as two layers. Launchers
  crop to any shape inside the central 72dp and may move layers by up to 18dp, so
  the mark sits inside the 66dp safe circle. A monochrome layer is used for
  Android 13+ themed icons.
- Google Play listing: 512x512 PNG, 32-bit, full square with no rounded corners
  and no shadow (Play applies its own mask and shadow).
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SS = 4  # supersampling factor

ORANGE_TOP = (255, 104, 68)
ORANGE_BOTTOM = (250, 76, 40)
ORANGE = (255, 90, 54)  # #FF5A36, brand accent
WHITE = (255, 255, 255)

# Waveform mark: five rounded bars, uneven like a real voice.
BARS = [0.34, 0.70, 1.0, 0.58, 0.30]
BAR_W = 0.175  # bar width as a share of mark height
GAP = 0.100    # gap as a share of mark height


def gradient(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(ORANGE_TOP[i] + (ORANGE_BOTTOM[i] - ORANGE_TOP[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=c + (255,))
    return img


def draw_mark(img: Image.Image, mark_h: float, color, cx: float = 0.5, cy: float = 0.5) -> None:
    """Draws the waveform centred at (cx, cy); mark_h is a share of the canvas."""
    s = img.size[0]
    h = mark_h * s
    bw, gap = BAR_W * h, GAP * h
    total = len(BARS) * bw + (len(BARS) - 1) * gap
    x = cx * s - total / 2
    d = ImageDraw.Draw(img)
    for b in BARS:
        bh = max(bw, b * h)
        top = cy * s - bh / 2
        d.rounded_rectangle([x, top, x + bw, top + bh], radius=bw / 2, fill=color)
        x += bw + gap


def render(size: int, background, mark_h: float, color, mode: str = "RGBA") -> Image.Image:
    big = size * SS
    img = gradient(big) if background == "gradient" else Image.new("RGBA", (big, big), background)
    if mark_h > 0:
        draw_mark(img, mark_h, color)
    img = img.resize((size, size), Image.LANCZOS)
    return img.convert(mode)


CLEAR = (0, 0, 0, 0)
IOS_MARK = 0.50                    # mark height on the iOS / Play square
ADAPTIVE_MARK = IOS_MARK * 72 / 108  # same look inside the visible 72dp of 108dp


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    out = {
        # iOS: opaque, square, no transparency (App Store rejects alpha).
        "icon.png": render(1024, "gradient", IOS_MARK, WHITE, "RGB"),
        "icon-dark.png": render(1024, CLEAR, IOS_MARK, ORANGE),
        "icon-tinted.png": render(1024, CLEAR, IOS_MARK, WHITE).convert("LA").convert("RGBA"),
        # Android adaptive layers (1024 px = 108dp).
        "android-icon-foreground.png": render(1024, CLEAR, ADAPTIVE_MARK, WHITE),
        "android-icon-background.png": render(1024, "gradient", 0, WHITE, "RGB"),
        "android-icon-monochrome.png": render(1024, CLEAR, ADAPTIVE_MARK, WHITE),
        # Google Play listing icon.
        "play-store-icon.png": render(512, "gradient", IOS_MARK, WHITE, "RGB"),
        # Splash mark (drawn on cream / near-black by expo-splash-screen) and web favicon.
        "splash-icon.png": render(1024, CLEAR, 0.56, ORANGE),
        "favicon.png": render(48, "gradient", IOS_MARK, WHITE, "RGB"),
    }
    for name, img in out.items():
        img.save(ASSETS / name, optimize=True)
        print(f"{name:32} {img.size[0]}x{img.size[1]} {img.mode}")


if __name__ == "__main__":
    main()
