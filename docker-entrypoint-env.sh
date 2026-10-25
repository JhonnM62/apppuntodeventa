#!/bin/sh
set -e

API_URL=$(printf '%s' "${EXPO_PUBLIC_API_URL:-http://localhost:3000/api/v1}" | tr -d '\r"'\''')
APP_VARIANT=$(printf '%s' "${EXPO_PUBLIC_APP_VARIANT:-restaurante1}" | tr -d '\r"'\''')

cat <<EOF > /usr/share/nginx/html/env-config.js
window.__ENV__ = {
  EXPO_PUBLIC_API_URL: "${API_URL}",
  EXPO_PUBLIC_APP_VARIANT: "${APP_VARIANT}"
};
EOF

if [ "$APP_VARIANT" = "fogata" ]; then
  sed -i 's/<title>[^<]*<\/title>/<title>Fogata POS<\/title>/g' /usr/share/nginx/html/index.html || true
  if [ -f /usr/share/nginx/html/favicon-fogata.png ]; then
    cp /usr/share/nginx/html/favicon-fogata.png /usr/share/nginx/html/favicon.ico || true
  fi
elif [ "$APP_VARIANT" = "restaurante" ] || [ "$APP_VARIANT" = "restaurante2" ]; then
  sed -i 's/<title>[^<]*<\/title>/<title>Q Hubo Mor Restaurante<\/title>/g' /usr/share/nginx/html/index.html || true
fi
