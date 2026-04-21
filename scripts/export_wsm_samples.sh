#!/usr/bin/env bash
# Export 50 most-recent rows from each WSM Mongo collection we care about for PG migration.
# Produces a single zip in the current directory.
#
# Defaults assume local Mongo, no auth, db=dev2 (as on dev server).
# Override via env if needed:
#   MONGO_URI="mongodb://user:pass@host:27017"
#   MONGO_DB="workshop17"
#
# Usage:
#   cd ~/reports
#   ./export_wsm_samples.sh

set -euo pipefail

DB="${MONGO_DB:-w17}"
URI="${MONGO_URI:-}"
TS="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="wsm_samples_${TS}"
ZIP_PATH="${OUT_DIR}.zip"

COLLECTIONS=(
  products
  memberships
  rooms
  locations
  users
  organisations
  lineitems
  invoices
  contracts
  licenses
  items
  vw_item_tracking_codes
  vw_product_tracking_codes
)

command -v mongoexport >/dev/null || { echo "Error: mongoexport not installed." >&2; exit 1; }
command -v zip          >/dev/null || { echo "Error: zip not installed." >&2; exit 1; }

mkdir -p "$OUT_DIR"

for COL in "${COLLECTIONS[@]}"; do
  echo "Exporting $COL (latest 50)..."
  if [ -n "$URI" ]; then
    mongoexport \
      --uri="$URI" \
      --db="$DB" \
      --collection="$COL" \
      --sort='{"updatedAt":-1,"_id":-1}' \
      --limit=50 \
      --pretty \
      --out="$OUT_DIR/${COL}_sample.json" \
      --quiet \
      2>/dev/null || echo "  (not found: $COL)"
  else
    mongoexport \
      --db="$DB" \
      --collection="$COL" \
      --sort='{"updatedAt":-1,"_id":-1}' \
      --limit=50 \
      --pretty \
      --out="$OUT_DIR/${COL}_sample.json" \
      --quiet \
      2>/dev/null || echo "  (not found: $COL)"
  fi
done

zip -rq "$ZIP_PATH" "$OUT_DIR"
rm -rf "$OUT_DIR"

echo ""
echo "Done: $ZIP_PATH"
ls -la "$ZIP_PATH"
