import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # paths below are relative to this folder
# Repack the visitor GLB as Paatti: painted textures, smaller normal maps, only the clips we use.
import json, struct, base64, sys
SRC = 'visitorF1.glb'
b = open(SRC, 'rb').read(); off = 12; ch = []
while off < len(b):
    l, t = struct.unpack('<II', b[off:off + 8]); ch.append(b[off + 8:off + 8 + l]); off += 8 + l
j = json.loads(ch[0]); B = ch[1]
KEEP = {'idle', 'listen', 'walk', 'walkFast'}
j['animations'] = [a for a in j['animations'] if a['name'] in KEEP]
newimg = {'visitorF1_body': ('paatti_body.jpg', 'image/jpeg'), 'visitorF1_body_n': ('paatti_body_n.jpg', 'image/jpeg'), 'visitorF1_head': ('paatti_head.jpg', 'image/jpeg'),
          'visitorF1_head_n': ('paatti_head_n.jpg', 'image/jpeg'), 'visitorF1_opacity': ('paatti_hair.png', 'image/png')}
# which bufferViews are still referenced
used = set()
def acc_bv(i): used.add(j['accessors'][i]['bufferView'])
for m in j['meshes']:
    for p in m['primitives']:
        for v in p['attributes'].values(): acc_bv(v)
        if 'indices' in p: acc_bv(p['indices'])
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: acc_bv(s['inverseBindMatrices'])
for a in j['animations']:
    for s in a['samplers']: acc_bv(s['input']); acc_bv(s['output'])
blobs = {}
for im in j['images']:
    used.add(im['bufferView']); fn, mt = newimg[im['name']]; blobs[im['bufferView']] = open(fn, 'rb').read(); im['mimeType'] = mt; im['name'] = im['name'].replace('visitorF1', 'paatti')
# drop accessors no longer referenced
acc_used = set()
for m in j['meshes']:
    for p in m['primitives']: acc_used |= set(p['attributes'].values()); acc_used.add(p.get('indices'))
for s in j['skins']: acc_used.add(s.get('inverseBindMatrices'))
for a in j['animations']:
    for s in a['samplers']: acc_used |= {s['input'], s['output']}
acc_used.discard(None)
amap = {}; accs = []
for i, a in enumerate(j['accessors']):
    if i in acc_used: amap[i] = len(accs); accs.append(a)
j['accessors'] = accs
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = amap[p['indices']]
for s in j['skins']:
    if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = amap[s['inverseBindMatrices']]
for a in j['animations']:
    for s in a['samplers']: s['input'] = amap[s['input']]; s['output'] = amap[s['output']]
used = {a['bufferView'] for a in j['accessors']} | {im['bufferView'] for im in j['images']}
bmap = {}; bvs = []; out = bytearray()
for i, bv in enumerate(j['bufferViews']):
    if i not in used: continue
    data = blobs.get(i) or B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    while len(out) % 4: out.append(0)
    nb = dict(bv); nb['byteOffset'] = len(out); nb['byteLength'] = len(data); nb['buffer'] = 0
    out += data; bmap[i] = len(bvs); bvs.append(nb)
while len(out) % 4: out.append(0)
for a in j['accessors']: a['bufferView'] = bmap[a['bufferView']]
for im in j['images']: im['bufferView'] = bmap[im['bufferView']]
j['bufferViews'] = bvs; j['buffers'] = [{'byteLength': len(out)}]
j['asset']['generator'] = 'Paatti (from Microsoft Rocketbox avatar f011, MIT) repainted for Patti Veedu'
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open('paatti-rb.glb', 'wb').write(glb)
open('../js/paatti-rb.js', 'w').write('// Paatti: Microsoft Rocketbox avatar (MIT, https://github.com/microsoft/Microsoft-Rocketbox), repainted\nwindow.PAATTI_RB_GLB="' + base64.b64encode(glb).decode() + '";\n')
print('glb', len(glb), 'anims', [a['name'] for a in j['animations']])
