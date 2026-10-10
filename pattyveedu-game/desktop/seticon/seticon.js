const fs = require('fs'), ResEdit = require('resedit'), PE = require('pe-library');
// usage: node seticon.js <neutralino-win_x64.exe> <out.exe> <version e.g. 10.4>
// puts the Paatti icon (icon.ico) and version info into the Windows exe
const path = require('path'), src = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]), [MA, MI] = (process.argv[4] || '10.4').split('.').map(Number), VS = `${MA}.${MI}.0`;
process.chdir(__dirname);
const exe = PE.NtExecutable.from(fs.readFileSync(src), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);
const before = res.entries.map(e => e.type).reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {});
const ico = ResEdit.Data.IconFile.from(fs.readFileSync('icon.ico'));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i => i.data));
let vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (!vi) vi = ResEdit.Resource.VersionInfo.createEmpty();
const L = { lang: 1033, codepage: 1200 };
vi.setFileVersion(MA, MI, 0, 0, 1033); vi.setProductVersion(MA, MI, 0, 0, 1033);
vi.setStringValues(L, { ProductName: "Patti Veedu (Grandma's House)", FileDescription: "Patti Veedu - Grandma's House", CompanyName: 'Zrubix', OriginalFilename: 'PattiVeedu.exe', InternalName: 'PattiVeedu', FileVersion: VS, ProductVersion: VS, LegalCopyright: 'Zrubix' });
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(out, Buffer.from(exe.generate()));
console.log('had groups', groups.length, 'gid', gid, 'types before', JSON.stringify(before), '->', fs.statSync(out).size);
