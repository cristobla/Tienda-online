#!/bin/sh
# Respaldo diario de la base (pg_dump, formato custom) y de las fotos, con rotación. Lo corre el servicio
# "respaldos" de docker-compose.prod.yml (imagen postgres:16-alpine; conexión por PGHOST/PGUSER/PGPASSWORD/PGDATABASE).
# Los archivos quedan en ./respaldos del servidor: copiarlos FUERA del servidor (docs/DESPLIEGUE.md §7).
#   sh respaldo.sh        → cada 24 h, para siempre
#   sh respaldo.sh una    → una vez (prueba)
set -eu
DIR=/respaldos
KEEP_DAYS="${KEEP_DAYS:-14}"

respaldar() {
  d=$(date +%F)
  # Se escribe a .tmp y se renombra: un respaldo a medias nunca queda con el nombre final.
  pg_dump -Fc -f "$DIR/tienda-$d.dump.tmp" && mv "$DIR/tienda-$d.dump.tmp" "$DIR/tienda-$d.dump"
  tar -czf "$DIR/fotos-$d.tar.gz.tmp" -C /data uploads && mv "$DIR/fotos-$d.tar.gz.tmp" "$DIR/fotos-$d.tar.gz"
  find "$DIR" -maxdepth 1 \( -name 'tienda-*.dump' -o -name 'fotos-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
  echo "$(date '+%F %T') respaldo listo: tienda-$d.dump y fotos-$d.tar.gz (se guardan $KEEP_DAYS días)"
}

if [ "${1:-}" = "una" ]; then
  respaldar
  exit 0
fi
while true; do
  # Un respaldo fallido (base caída) no detiene el ciclo: se avisa y se reintenta en una hora.
  if respaldar; then sleep 86400; else echo "$(date '+%F %T') ERROR en el respaldo; reintento en 1 hora" >&2; sleep 3600; fi
done
