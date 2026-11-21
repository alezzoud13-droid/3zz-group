#!/bin/sh
# ينشئ قاعدة بيانات اختبار محلية فيها كل التحديثات بالترتيب.
# الاستخدام: PGHOST=/tmp/pgd PGPORT=5544 ./reset.sh اسم_القاعدة [--without-011]
# NO025=1 ./reset.sh … — بدون التحديث 25: لاختبارات القواعد القديمة اللي فكسشراتها ترشيحات بدون ملف مؤثر
set -e
DIR=$(cd "$(dirname "$0")" && pwd); SQL="$DIR/../../supabase"; D=$1
P="psql -q -U postgres"; export PGOPTIONS="-c client_min_messages=warning"
$P -c "drop database if exists $D" && $P -c "create database $D"
$P -d $D -f "$DIR/supabase_stub.sql" >/dev/null 2>&1 || true
FILES="schema.sql 002_acquisition_campaigns.sql 003_request_thread.sql 004_export_backup.sql 005_no_self_approval.sql 006_video_review.sql 007_privacy_shipping.sql 008_quota_cap_pay_approval.sql 009_lock_after_approval.sql 009_requests_privacy.sql 010_campaign_budget.sql"
[ "$2" = "--without-011" ] || FILES="$FILES 011_role_columns.sql"
FILES="$FILES 012_nine_stages.sql 013_full_ownership.sql 014_creators_only_nominate.sql 015_platform_ops_ship_rules.sql 016_video_code_bank_view_sync.sql 017_video_rating.sql 018_requests_immutable.sql 019_transfer_log.sql 020_pay_terms.sql 021_withdraw_prepaid.sql 022_quota_budget.sql 023_withdraw_cause.sql 024_unique_identity.sql"
[ -n "$NO025" ] || FILES="$FILES 025_identity_required.sql"
for f in $FILES; do $P -d $D -v ON_ERROR_STOP=1 -f "$SQL/$f" >/dev/null; done
echo "ready: $D"
