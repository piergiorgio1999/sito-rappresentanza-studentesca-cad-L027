#!/usr/bin/env bash
# Ingrandisce con Real-ESRGAN l'ortofoto AGEA 2020 della Città Universitaria,
# tassello per tassello, per la vista 3D del sito.
#
# Uso (dalla radice del repository):
#   scripts/campus-ortho-sr.sh [SCALA]        # SCALA: 2 o 4 (predefinita 4)
#
# Requisiti: curl, awk e realesrgan-ncnn-vulkan
# (https://github.com/xinntao/Real-ESRGAN/releases, versione macOS, Windows o Linux;
#  sul Mac usa la GPU Apple tramite Vulkan/MoltenVK).
# Imposta REALESRGAN se l'eseguibile non è nel PATH:
#   REALESRGAN=~/Downloads/realesrgan-ncnn-vulkan/realesrgan-ncnn-vulkan scripts/campus-ortho-sr.sh
#
# Scarica ogni tassello di 64 m alla risoluzione nativa AGEA (circa 20 cm per pixel)
# dalla funzione /api/campus-ortho del sito, lo ingrandisce e scrive:
#   site/campus-3d/tiles/sr/<colonna>_<riga>.jpg
#   site/campus-3d/tiles/manifest.json
# La griglia è la stessa usata da campus-3d.js (TILE_M, ORTHO_BOUNDS): non cambiarla
# da una sola parte.
#
# Nota: un ingrandimento con IA non aggiunge informazione reale, la ricostruisce.
# Le immagini derivano dall'ortofoto Regione Lazio AGEA 2020 (CC BY 4.0) e vanno
# attribuite come modificate.
set -euo pipefail

SCALE="${1:-4}"
case "$SCALE" in 2|4) ;; *) echo "SCALA deve essere 2 o 4" >&2; exit 2 ;; esac
SITE="${SITE:-https://orari-chimica.pages.dev}"
REALESRGAN="${REALESRGAN:-realesrgan-ncnn-vulkan}"
MODEL="${MODEL:-realesrgan-x4plus}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/site/campus-3d/tiles"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v curl >/dev/null || { echo "curl non trovato" >&2; exit 1; }
command -v "$REALESRGAN" >/dev/null || { echo "realesrgan-ncnn-vulkan non trovato: imposta REALESRGAN" >&2; exit 1; }

# Griglia identica a campus-3d.js
WEST=12.5098; SOUTH=41.8992; EAST=12.5232; NORTH=41.9062; TILE_M=64; SRC_PX=320
read -r COLS ROWS < <(awk -v w=$WEST -v e=$EAST -v s=$SOUTH -v n=$NORTH -v t=$TILE_M 'BEGIN{
  pi=atan2(0,-1); mlon=111320*cos(41.902*pi/180); mlat=111132;
  dlon=t/mlon; dlat=t/mlat; c=int((e-w)/dlon); if (c*dlon<e-w) c++; r=int((n-s)/dlat); if (r*dlat<n-s) r++; print c, r }')
echo "Griglia: $COLS colonne × $ROWS righe, scala ×$SCALE"

mkdir -p "$OUT/sr" "$WORK/in" "$WORK/out"
done_list=()
for ((r=0; r<ROWS; r++)); do
  for ((c=0; c<COLS; c++)); do
    read -r BBOX H < <(awk -v w=$WEST -v n=$NORTH -v t=$TILE_M -v c=$c -v r=$r -v px=$SRC_PX 'BEGIN{
      pi=atan2(0,-1); mlon=111320*cos(41.902*pi/180); mlat=111132; dlon=t/mlon; dlat=t/mlat;
      west=w+c*dlon; north=n-r*dlat; printf "%.6f,%.6f,%.6f,%.6f %d\n", west, north-dlat, west+dlon, north, int(px*(mlat*dlat)/(mlon*dlon)+0.5) }')
    key="${c}_${r}"
    src="$WORK/in/$key.jpg"
    if ! curl -fsS --retry 2 -o "$src" "$SITE/api/campus-ortho?bbox=$BBOX&w=$SRC_PX&h=$H"; then
      echo "  $key: download non riuscito, salto" >&2; continue
    fi
    "$REALESRGAN" -i "$src" -o "$WORK/out/$key.jpg" -n "$MODEL" -s "$SCALE" -f jpg >/dev/null 2>&1 || { echo "  $key: ingrandimento non riuscito" >&2; continue; }
    mv "$WORK/out/$key.jpg" "$OUT/sr/$key.jpg"
    done_list+=("\"$key\"")
    printf '  %s pronto\n' "$key"
  done
done

{
  printf '{\n  "source": "Regione Lazio, Ortofoto AGEA 2020 (CC BY 4.0), ingrandita con Real-ESRGAN x%s",\n' "$SCALE"
  printf '  "tileMeters": %s,\n  "bounds": {"west": %s, "south": %s, "east": %s, "north": %s},\n' "$TILE_M" "$WEST" "$SOUTH" "$EAST" "$NORTH"
  printf '  "path": "tiles/sr/{c}_{r}.jpg",\n  "tiles": [%s]\n}\n' "$(IFS=,; echo "${done_list[*]}")"
} > "$OUT/manifest.json"
echo "Fatto: ${#done_list[@]} tasselli in $OUT"
