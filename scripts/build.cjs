const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const addon = path.join(root, 'addon');
const manifest = JSON.parse(fs.readFileSync(path.join(addon, 'manifest.json'), 'utf8'));
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, {recursive:true});
const xpi = path.join(dist, `zotero-web-translate-${manifest.version}.xpi`);
// Use the Windows bundled ZIP API; XPI is a standard ZIP with manifest at root.
const ps = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$destination = $env:WT_XPI
if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination }
$archive = [IO.Compression.ZipFile]::Open($destination,[IO.Compression.ZipArchiveMode]::Create)
try {
  $base = $env:WT_ADDON
  Get-ChildItem -LiteralPath $base -Recurse -File | Sort-Object FullName | ForEach-Object {
    $name = $_.FullName.Substring($base.Length + 1).Replace('\\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$_.FullName,$name) | Out-Null
  }
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $env:WT_ROOT 'LICENSE'),'LICENSE') | Out-Null
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $env:WT_ROOT 'NOTICE.md'),'NOTICE.md') | Out-Null
} finally { $archive.Dispose() }
`;
cp.execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command', ps], {
  env:{...process.env, WT_XPI:xpi, WT_ADDON:addon, WT_ROOT:root}, stdio:'inherit'
});
const digest = crypto.createHash('sha256').update(fs.readFileSync(xpi)).digest('hex');
fs.writeFileSync(xpi + '.sha256', digest + '  ' + path.basename(xpi) + '\n');
console.log(xpi);
console.log('SHA-256 ' + digest);
