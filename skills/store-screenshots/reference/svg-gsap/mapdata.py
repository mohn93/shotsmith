# Derive a dotted land grid + server positions from the real propagation capture (input 3).
# Run from the workspace root: python3 pages/mapdata.py -> pages/mapdata.json. Colors and Y0/Y1 fit DNS Kit's map.
from PIL import Image
import json, math
im = Image.open('inputs/3.png').convert('RGBA'); px = im.load()
W, H = im.size
Y0, Y1 = 1900, 5275
def cls(x, y):
    r, g, b, a = px[x, y]
    if a < 200: return None
    if g > 150 and r < 120 and b < 120: return 'land'  # checkmark
    dw = (r-170)**2 + (g-211)**2 + (b-223)**2
    dl = (r-242)**2 + (g-239)**2 + (b-233)**2
    return 'land' if dl < dw else 'water'
# Dot grid
D = 26
dots = []
for gy in range(Y0 + D//2, Y1, D):
    for gx in range(D//2, W, D):
        votes = 0; n = 0
        for dx in (-6, 0, 6):
            for dy in (-6, 0, 6):
                c = cls(min(W-1, max(0, gx+dx)), min(H-1, max(0, gy+dy)))
                if c is None: continue
                n += 1; votes += (c == 'land')
        if n and votes / n > 0.5:
            dots.append([gx, gy])
# Green check components (on a 4px grid)
S = 4
mask = {}
for y in range(Y0, Y1, S):
    for x in range(0, W, S):
        r, g, b, a = px[x, y]
        if g > 150 and r < 120 and b < 120: mask[(x, y)] = 1
seen = set(); comps = []
for k in mask:
    if k in seen: continue
    stack = [k]; seen.add(k); pts = []
    while stack:
        p = stack.pop(); pts.append(p)
        for dx in (-S, 0, S):
            for dy in (-S, 0, S):
                q = (p[0]+dx, p[1]+dy)
                if q in mask and q not in seen: seen.add(q); stack.append(q)
    if len(pts) > 20:
        comps.append(pts)
out = []
for pts in comps:
    cx = sum(p[0] for p in pts)/len(pts); cy = sum(p[1] for p in pts)/len(pts)
    out.append({'x': round(cx), 'y': round(cy), 'n': len(pts)})
out.sort(key=lambda c: -c['n'])
json.dump({'W': W, 'Y0': Y0, 'Y1': Y1, 'D': D, 'dots': dots, 'checks': out}, open('pages/mapdata.json', 'w'))
print(len(dots), 'dots'); print(out)
