# Run: python hardware/universal-camera/media/render-turntable.py  (writes frames + mp4/gif via ffmpeg)
import os, glob, subprocess, shutil
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

HERE = os.path.dirname(os.path.abspath(__file__))
PRINT_DIR = os.path.join(HERE, "..", "print")
FRAME_DIR = os.path.join(HERE, "_frames")
FPS, N_FRAMES, PX = 30, 150, 1000   # 5 s turntable, 1000x1000
ELEV = 20.0
BG = "#0e1116"
# per-part base colour: body / axle / knob / mount arm
COLORS = {
    "shell-part-2.stl": (0.239, 0.255, 0.694),
    "shell-part-3.stl": (0.180, 0.196, 0.560),
    "shell-part-4.stl": (0.400, 0.420, 0.850),
    "shell-part-5.stl": (0.239, 0.255, 0.694),
}

def load_stl(path):
    d = open(path, "rb").read()
    n = int(np.frombuffer(d, "<u4", 1, 80)[0])
    dt = np.dtype([("n", "<3f4"), ("v", "<3,3f4"), ("a", "<u2")])
    t = np.frombuffer(d, dtype=dt, count=n, offset=84)
    return np.asarray(t["v"], dtype=np.float64)          # (n,3,3)

tris, base = [], []
for f in sorted(glob.glob(os.path.join(PRINT_DIR, "*.stl"))):
    v = load_stl(f)
    tris.append(v)
    base.append(np.repeat(np.array(COLORS[os.path.basename(f)])[None, :], len(v), axis=0))
V = np.concatenate(tris)                                  # (F,3,3) in STL frame: Y is up
C = np.concatenate(base)

# STL Y-up -> matplotlib Z-up
V = V[:, :, [0, 2, 1]]
V[:, :, 1] *= -1

lo, hi = V.reshape(-1, 3).min(0), V.reshape(-1, 3).max(0)
ctr, span = (lo + hi) / 2, hi - lo
V -= ctr
lo, hi = -span / 2, span / 2

# geometry-derived normals (STL header normals are unreliable) + face centroids
e1 = V[:, 1] - V[:, 0]
e2 = V[:, 2] - V[:, 0]
N = np.cross(e1, e2)
N /= (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)
CEN = V.mean(axis=1)

R = float(span.max()) / 2 * 1.06          # framing radius (cube half-side)
KEY = np.array([-0.45, -0.80, 0.50]); KEY /= np.linalg.norm(KEY)
FILL = np.array([0.70, 0.45, 0.30]); FILL /= np.linalg.norm(FILL)

os.makedirs(FRAME_DIR, exist_ok=True)
for f in glob.glob(os.path.join(FRAME_DIR, "*.png")):
    os.remove(f)

for i in range(N_FRAMES):
    azim = 360.0 * i / N_FRAMES
    a, e = np.radians(azim), np.radians(ELEV)
    cam = np.array([np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)])

    # backface cull, then painter's sort (far -> near) along the view axis
    front = N @ cam > -0.02
    idx = np.where(front)[0]
    idx = idx[np.argsort(CEN[idx] @ cam)]

    nf = N[idx]
    key = np.clip(np.abs(nf @ KEY), 0, 1) ** 0.7
    fill = np.clip(np.abs(nf @ FILL), 0, 1)
    shade = (0.10 + 1.25 * key + 0.16 * fill)[:, None]
    rgb = np.clip(C[idx] * shade + 0.45 * np.clip(shade - 1.02, 0, None), 0, 1)

    fig = plt.figure(figsize=(PX / 100, PX / 100), dpi=100, facecolor=BG)
    ax = fig.add_subplot(111, projection="3d", facecolor=BG)
    # edge colour == face colour, hairline width: closes the antialiasing seams
    # between coplanar triangles without drawing a visible wireframe
    pc = Poly3DCollection(V[idx], facecolors=rgb, edgecolors=rgb,
                          linewidths=0.35, shade=False)
    # matplotlib's own zsort is an average-depth painter sort and reorders
    # facecolors with the polys, so the per-face shading stays attached.
    pc.set_zsort("average")
    ax.add_collection3d(pc)
    # cube limits + unit box aspect: true proportions, and nothing clips at any azimuth
    ax.set_xlim(-R, R); ax.set_ylim(-R, R); ax.set_zlim(-R, R)
    ax.set_box_aspect((1, 1, 1))
    ax.view_init(elev=ELEV, azim=azim)
    try:
        ax.set_proj_type("persp", focal_length=1.6)
    except TypeError:
        pass
    ax.set_axis_off()
    ax.margins(0)
    fig.subplots_adjust(left=-0.15, right=1.15, bottom=-0.15, top=1.15)
    fig.savefig(os.path.join(FRAME_DIR, f"f{i:04d}.png"), facecolor=BG)
    plt.close(fig)
    if i % 25 == 0:
        print("frame", i)

ff = shutil.which("ffmpeg") or "ffmpeg"
mp4 = os.path.join(HERE, "shell-turntable.mp4")
gif = os.path.join(HERE, "shell-turntable.gif")
pal = os.path.join(FRAME_DIR, "pal.png")
src = os.path.join(FRAME_DIR, "f%04d.png")
run = lambda c: subprocess.run(c, check=True)
run([ff, "-y", "-framerate", str(FPS), "-i", src, "-c:v", "libx264", "-crf", "20",
     "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4])
run([ff, "-y", "-i", mp4, "-vf", "fps=15,scale=480:-1:flags=lanczos,palettegen=max_colors=128", pal])
run([ff, "-y", "-i", mp4, "-i", pal, "-lavfi",
     "fps=15,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3", gif])
print("mp4", os.path.getsize(mp4), "gif", os.path.getsize(gif))
