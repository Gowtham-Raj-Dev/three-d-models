import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # paths below are relative to this folder
# Valli's GLB: the child avatar's mesh and skeleton with the repainted maps embedded
import json, struct, base64
b = open('child_src.glb', 'rb').read(); off = 12; ch = []
while off < len(b):
    l, t = struct.unpack('<II', b[off:off + 8]); ch.append(b[off + 8:off + 8 + l]); off += 8 + l
j = json.loads(ch[0]); B = bytearray(ch[1])
imgs = [('valli_body', 'valli_body.jpg'), ('valli_body_n', 'valli_body_n.jpg'), ('valli_head', 'valli_head.jpg'), ('valli_head_n', 'valli_head_n.jpg')]
j['images'] = []; j['textures'] = []; j.setdefault('bufferViews', [])
while len(B) % 4: B.append(0)
for i, (name, fn) in enumerate(imgs):
    data = open(fn, 'rb').read(); j['bufferViews'].append({'buffer': 0, 'byteOffset': len(B), 'byteLength': len(data)}); B += data
    while len(B) % 4: B.append(0)
    j['images'].append({'name': name, 'mimeType': 'image/jpeg', 'bufferView': len(j['bufferViews']) - 1}); j['textures'].append({'sampler': 0, 'source': i})
j['samplers'] = [{'wrapS': 10497, 'wrapT': 10497}]
for m in j['materials']:
    body = 'body' in m['name']; m['pbrMetallicRoughness'] = {'baseColorTexture': {'index': 0 if body else 2}, 'metallicFactor': 0.0, 'roughnessFactor': 0.8}
    m['normalTexture'] = {'index': 1 if body else 3}; m.pop('extras', None)
j['buffers'] = [{'byteLength': len(B)}]
j.pop('animations', None)
j['asset']['generator'] = 'Valli (from Microsoft Rocketbox avatar Female_Child_01, MIT) repainted for Patti Veedu'
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(B)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(B), 0x004E4942) + bytes(B)
open('valli-rb.glb', 'wb').write(glb)
open('../../js/valli-rb.js', 'w').write('// Valli: Microsoft Rocketbox avatar (MIT, https://github.com/microsoft/Microsoft-Rocketbox), repainted\nwindow.VALLI_RB_GLB="' + base64.b64encode(glb).decode() + '";\n')
print('glb KB', len(glb) // 1024)
