import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path
import matplotlib.patches as patches
from PIL import Image

# Coords from public/gemini-svg.svg
# Path commands: M + 15 C commands
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

# ViewBox: X: 109 to 109+342=451, Y: 65 to 65+342=407
# In matplotlib, Y is inverted compared to SVG (Y=0 is bottom in plt, top in SVG)
# So we invert Y: y_plt = 407 - (y_svg - 65) = 472 - y_svg
# Or we simply set ax.set_ylim(407, 65) (inverted axis)

def render_icon(stroke_color, dot_color, size, output_path):
    fig = plt.figure(figsize=(size/100, size/100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(109, 451)
    ax.set_ylim(407, 65) # Invert Y so 65 is top and 407 is bottom
    ax.axis('off')
    fig.patch.set_alpha(0.0)
    ax.patch.set_alpha(0.0)

    # Scale stroke width with respect to viewbox: stroke_width=18 out of 342
    # In points: size * (18 / 342) * (72 / dpi)
    lw = size * (18.0 / 342.0) * (72.0 / 100.0)

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

    plt.savefig(output_path, format='png', transparent=True, dpi=100)
    plt.close(fig)

public_dir = r"c:\Users\sruja\.vscode\instruversal\public"

# Render high-res light and dark PNGs
print("Rendering light mode PNGs...")
render_icon('#1C1A16', '#D2432A', 512, os.path.join(public_dir, 'icon-512.png'))
render_icon('#1C1A16', '#D2432A', 192, os.path.join(public_dir, 'icon-192.png'))
render_icon('#1C1A16', '#D2432A', 180, os.path.join(public_dir, 'apple-touch-icon.png'))
render_icon('#1C1A16', '#D2432A', 32, os.path.join(public_dir, 'favicon-32x32.png'))
render_icon('#1C1A16', '#D2432A', 16, os.path.join(public_dir, 'favicon-16x16.png'))
# Also icon.png and favicon.png
render_icon('#1C1A16', '#D2432A', 512, os.path.join(public_dir, 'icon.png'))
render_icon('#1C1A16', '#D2432A', 32, os.path.join(public_dir, 'favicon.png'))

print("Rendering dark mode PNGs...")
render_icon('#F3ECDD', '#D2432A', 512, os.path.join(public_dir, 'icon-dark-512.png'))
render_icon('#F3ECDD', '#D2432A', 192, os.path.join(public_dir, 'icon-dark-192.png'))
render_icon('#F3ECDD', '#D2432A', 512, os.path.join(public_dir, 'icon-dark.png'))
render_icon('#F3ECDD', '#D2432A', 32, os.path.join(public_dir, 'favicon-dark-32x32.png'))

# Generate favicon.ico (multi-size ico: 16, 32, 48)
img32 = Image.open(os.path.join(public_dir, 'favicon-32x32.png'))
img16 = Image.open(os.path.join(public_dir, 'favicon-16x16.png'))
ico_path = os.path.join(public_dir, 'favicon.ico')
img32.save(ico_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])

print("Done! All icons generated successfully.")
