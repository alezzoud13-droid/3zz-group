#!/bin/sh
# ينشئ قاعدة بيانات اختبار محلية فيها كل التحديثات بالترتيب.
# الاستخدام: PGHOST=/tmp/pgd PGPORT=5544 ./reset.sh اسم_القاعدة [--without-011]
set -e
DIR=$(cd "$(dirname "$0")" && pwd); SQL="$DIR/../../supabase"; D=$1
P="psql -q -U postgres"; export PGOPTIONS="-c client_min_messages=warning"
$P -c "drop database if exists $D" && $P -c "create database $D"
$P -d $D -f "$DIR/supabase_stub.sql" >/dev/null 2>&1 || true
FILES="schema.sql 002_acquisition_campaigns.sql 003_request_thread.sql 004_export_backup.sql 005_no_self_approval.sql 006_video_review.sql 007_privacy_shipping.sql 008_quota_cap_pay_approval.sql 009_lock_after_approval.sql 009_requests_privacy.sql 010_campaign_budget.sql"
[ "$2" = "--without-011" ] || FILES="$FILES 011_role_columns.sql"
for f in $FILES; do $P -d $D -v ON_ERROR_STOP=1 -f "$SQL/$f" >/dev/null; done
echo "ready: $D"
