import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path
import matplotlib.patches as patches
from PIL import Image, ImageDraw, ImageFont

commands = [
    (Path.MOVETO, (242, 112)),
    (Path.CURVE4, (236, 98)), (Path.CURVE4, (244, 84)), (Path.CURVE4, (255, 84)),
    (Path.CURVE4, (266, 84)), (Path.CURVE4, (270, 96)), (Path.CURVE4, (261, 106)),
    (Path.CURVE4, (253, 116)), (Path.CURVE4, (247, 132)), (Path.CURVE4, (245, 152)),
    (Path.CURVE4, (214, 167)), (Path.CURVE4, (194, 198)), (Path.CURVE4, (214, 230)),
    (Path.CURVE4, (226, 249)), (Path.CURVE4, (225, 258)), (Path.CURVE4, (206, 276)),
    (Path.CURVE4, (184, 298)), (Path.CURVE4, (194, 345)), (Path.CURVE4, (238, 362)),
    (Path.CURVE4, (250, 367)), (Path.CURVE4, (262, 367)), (Path.CURVE4, (274, 362)),
    (Path.CURVE4, (318, 345)), (Path.CURVE4, (328, 298)), (Path.CURVE4, (306, 276)),
    (Path.CURVE4, (287, 258)), (Path.CURVE4, (286, 249)), (Path.CURVE4, (298, 230)),
    (Path.CURVE4, (318, 198)), (Path.CURVE4, (298, 167)), (Path.CURVE4, (267, 152)),
    (Path.CURVE4, (260, 166)), (Path.CURVE4, (258, 205)), (Path.CURVE4, (256, 248)),
    (Path.CURVE4, (254, 266)), (Path.CURVE4, (248, 276)), (Path.CURVE4, (257, 286)),
    (Path.CURVE4, (264, 295)), (Path.CURVE4, (258, 322)), (Path.CURVE4, (256, 362)),
    (Path.CURVE4, (255, 386)), (Path.CURVE4, (288, 388)), (Path.CURVE4, (310, 368)),
    (Path.CURVE4, (330, 350)), (Path.CURVE4, (352, 255)), (Path.CURVE4, (372, 136)),
]

codes = [c[0] for c in commands]
verts = [c[1] for c in commands]
path = Path(verts, codes)

def render_icon(stroke_color, dot_color, size, output_path, bg_color=None, padding_ratio=1.0):
    fig = plt.figure(figsize=(size/100, size/100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])

    base_x = 109
    base_y = 65
    base_w = 342
    cx = base_x + base_w / 2
    cy = base_y + base_w / 2

    span = base_w * padding_ratio
    ax.set_xlim(cx - span / 2, cx + span / 2)
    ax.set_ylim(cy + span / 2, cy - span / 2) # Invert Y
    ax.axis('off')

    if bg_color:
        fig.patch.set_facecolor(bg_color)
        ax.patch.set_facecolor(bg_color)
    else:
        fig.patch.set_alpha(0.0)
        ax.patch.set_alpha(0.0)

    lw = (size / padding_ratio) * (18.0 / 342.0) * (72.0 / 100.0)

    patch = patches.PathPatch(
        path,
        facecolor='none',
        edgecolor=stroke_color,
        linewidth=lw,
        capstyle='round',
        joinstyle='round',
        antialiased=True
    )
    ax.add_patch(patch)

    circle = patches.Circle(
        (372, 136),
        radius=16,
        facecolor=dot_color,
        edgecolor='none',
        antialiased=True
    )
    ax.add_patch(circle)

    plt.savefig(output_path, format='png', transparent=(bg_color is None), dpi=100)
    plt.close(fig)

public_dir = r"c:\Users\sruja\.vscode\instruversal\public"

print("Rendering light mode PNGs...")
render_icon('#1C1A16', '#D2432A', 512, os.path.join(public_dir, 'icon-512.png'))
render_icon('#1C1A16', '#D2432A', 192, os.path.join(public_dir, 'icon-192.png'))
render_icon('#1C1A16', '#D2432A', 180, os.path.join(public_dir, 'apple-touch-icon.png'))
render_icon('#1C1A16', '#D2432A', 32, os.path.join(public_dir, 'favicon-32x32.png'))
render_icon('#1C1A16', '#D2432A', 16, os.path.join(public_dir, 'favicon-16x16.png'))
render_icon('#1C1A16', '#D2432A', 512, os.path.join(public_dir, 'icon.png'))
render_icon('#1C1A16', '#D2432A', 32, os.path.join(public_dir, 'favicon.png'))

print("Rendering maskable icon (paper background, 80% safe zone)...")
render_icon('#1C1A16', '#D2432A', 512, os.path.join(public_dir, 'icon-maskable-512.png'), bg_color='#F3ECDD', padding_ratio=1.35)

print("Rendering dark mode PNGs...")
render_icon('#F3ECDD', '#D2432A', 512, os.path.join(public_dir, 'icon-dark-512.png'))
render_icon('#F3ECDD', '#D2432A', 192, os.path.join(public_dir, 'icon-dark-192.png'))
render_icon('#F3ECDD', '#D2432A', 512, os.path.join(public_dir, 'icon-dark.png'))
render_icon('#F3ECDD', '#D2432A', 32, os.path.join(public_dir, 'favicon-dark-32x32.png'))

# Generate favicon.ico
img32 = Image.open(os.path.join(public_dir, 'favicon-32x32.png'))
ico_path = os.path.join(public_dir, 'favicon.ico')
img32.save(ico_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])

# Generate OG Image (1200x630)
print("Rendering Open Graph image (1200x630)...")
og_img = Image.new('RGBA', (1200, 630), '#F3ECDD')
draw = ImageDraw.Draw(og_img)

# Hairline grid subtle decoration
for x in range(0, 1200, 80):
    draw.line([(x, 0), (x, 630)], fill=(28, 26, 22, 12), width=1)
for y in range(0, 630, 80):
    draw.line([(0, y), (1200, y)], fill=(28, 26, 22, 12), width=1)

# Subtle paper border
draw.rectangle([(24, 24), (1176, 606)], outline=(28, 26, 22, 30), width=1)

# Render instrument icon onto OG image
temp_icon_path = os.path.join(public_dir, '_temp_og_icon.png')
render_icon('#1C1A16', '#D2432A', 360, temp_icon_path)
icon_p = Image.open(temp_icon_path)
og_img.paste(icon_p, (120, 135), icon_p)
if os.path.exists(temp_icon_path):
    os.remove(temp_icon_path)

# Text: "Instruversal" and subtitle
# Try to load Windows Georgia / Times / Trebuchet or default font
font_title = None
font_sub = None
font_tag = None
for fpath in ["C:/Windows/Fonts/georgia.ttf", "C:/Windows/Fonts/times.ttf", "C:/Windows/Fonts/arial.ttf"]:
    if os.path.exists(fpath):
        try:
            font_title = ImageFont.truetype(fpath, 76)
            font_sub = ImageFont.truetype(fpath, 28)
            font_tag = ImageFont.truetype(fpath, 20)
            break
        except Exception:
            pass

if not font_title:
    font_title = ImageFont.load_default()
    font_sub = ImageFont.load_default()
    font_tag = ImageFont.load_default()

draw.text((530, 220), "Instruversal", fill='#1C1A16', font=font_title)
draw.text((534, 320), "Draw strokes to compose. Notes loop in time.", fill='#5B554A', font=font_sub)
draw.text((534, 380), "DRAW-TO-MUSIC SEQUENCER", fill='#D2432A', font=font_tag)

og_img.save(os.path.join(public_dir, 'og-image.png'), format='PNG')

print("Done! All icons, maskable icon, and og-image.png generated successfully.")
