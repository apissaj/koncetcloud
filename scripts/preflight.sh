#!/bin/bash
# omni-buddy preflight: what WOULD be uploaded, without uploading anything.
#
# Uses operations/check (read-only on both sides). rclone's sync/copy dryRun
# parameter is NOT honoured over the RC API in 1.75.x, so never use it as a
# dry run: it uploads for real.
#
# missingOnDst = files that a sync would upload
# missingOnSrc = files that exist remotely but not locally
# differ       = same name, different content
RC="http://127.0.0.1:5572"
OUT="D:/omni-buddy/logs/preflight-report.json"
: > "$OUT"

check () {
  local name="$1" src="$2" dst="$3"
  echo ">>> $name"
  local raw
  raw=$(curl -s --max-time 3600 -X POST "$RC/operations/check" \
        --data-urlencode "srcFs=$src" \
        --data-urlencode "dstFs=$dst")
  printf '%s\n' "$raw" | python -c "
import sys, json
name = sys.argv[1]; src = sys.argv[2]; dst = sys.argv[3]
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    print('  parse error:', e); sys.exit()
up   = d.get('missingOnDst') or []
extra= d.get('missingOnSrc') or []
diff = d.get('differ') or []
err  = d.get('error') or []
print(f'  perlu upload : {len(up)} file')
print(f'  sudah di dst : {len(extra)} file')
print(f'  beda isi     : {len(diff)} file')
print(f'  error        : {len(err)}')
import json as j
print(j.dumps({'name':name,'src':src,'dst':dst,'toUpload':len(up),'alreadyOnDst':len(extra),'differ':len(diff),'errors':len(err)}, ensure_ascii=False))
" "$name" "$src" "$dst" | tee -a "$OUT"
}

check "Backup iPhone - HP IP15"      "D:/HP IP15"            "gdrive:Backup iPhone/HP IP15"
check "Backup iPhone - Video Iphone" "D:/Video Iphone"       "gdrive:Backup iPhone/Video Iphone"
check "Backup iPhone - video"        "D:/video"              "gdrive:Backup iPhone/video"
check "Backup - Flashdisk Sayaangg"  "D:/Flashdisk Sayaangg" "gdrive:Backup Flashdisk/Flashdisk Sayaangg"

echo "DONE"