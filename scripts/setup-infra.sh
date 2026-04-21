#!/usr/bin/env bash
# Smart Attendance System — Wave 1 Infrastructure Setup
# Run from project root in VSCode terminal (Git Bash)
# Usage: bash scripts/setup-infra.sh

set -e  # stop on first error

# ─── FILL THESE IN WHEN YOU HAVE AWS ACCOUNT DETAILS ──────────────────────────
ACCOUNT_ID="YOUR_ACCOUNT_ID_HERE"   # e.g. 123456789012
LEADER_EMAIL="YOUR_EMAIL_HERE"      # e.g. leorenzo@gmail.com
# ──────────────────────────────────────────────────────────────────────────────

REGION="ap-southeast-1"
PHOTO_BUCKET="smart-attendance-photos"
FRONTEND_BUCKET="smart-attendance-frontend"
COLLECTION_ID="smart-attendance-faces"
ROLE_NAME="lambda-attendance-role"
POLICY_NAME="lambda-attendance-policy"

echo "================================================="
echo " Smart Attendance — Wave 1 Infrastructure Setup"
echo "================================================="
echo "Account ID : $ACCOUNT_ID"
echo "Region     : $REGION"
echo ""

# Guard against placeholder values
if [ "$ACCOUNT_ID" = "YOUR_ACCOUNT_ID_HERE" ]; then
  echo "ERROR: Fill in ACCOUNT_ID before running this script."
  exit 1
fi

# ─── 1. S3 Photo Bucket ───────────────────────────────────────────────────────
echo "[1/6] Creating S3 photo bucket..."
aws s3api create-bucket \
  --bucket "$PHOTO_BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null || echo "  Bucket already exists — skipping."

aws s3api put-public-access-block \
  --bucket "$PHOTO_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "  Done: s3://$PHOTO_BUCKET (public access blocked)"

# ─── 2. Rekognition Face Collection ──────────────────────────────────────────
echo "[2/6] Creating Rekognition collection..."
aws rekognition create-collection \
  --collection-id "$COLLECTION_ID" \
  --region "$REGION" 2>/dev/null || echo "  Collection already exists — skipping."
echo "  Done: collection '$COLLECTION_ID'"

# ─── 3. DynamoDB Tables ──────────────────────────────────────────────────────
echo "[3/6] Creating DynamoDB tables..."

aws dynamodb create-table \
  --table-name Students \
  --attribute-definitions AttributeName=studentId,AttributeType=S \
  --key-schema AttributeName=studentId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" 2>/dev/null || echo "  Students table already exists — skipping."

aws dynamodb create-table \
  --table-name AttendanceLogs \
  --attribute-definitions \
    AttributeName=logId,AttributeType=S \
    AttributeName=studentId,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema AttributeName=logId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{"IndexName":"studentId-timestamp-index","KeySchema":[{"AttributeName":"studentId","KeyType":"HASH"},{"AttributeName":"timestamp","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --region "$REGION" 2>/dev/null || echo "  AttendanceLogs table already exists — skipping."

echo "  Done: Students + AttendanceLogs tables"

# ─── 4. IAM Role for Lambda ──────────────────────────────────────────────────
echo "[4/6] Creating IAM role..."

cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document file:///tmp/trust-policy.json 2>/dev/null || echo "  Role already exists — skipping create."

cat > /tmp/attendance-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::${PHOTO_BUCKET}/*"
    },
    {
      "Effect": "Allow",
      "Action": ["rekognition:IndexFaces", "rekognition:SearchFacesByImage", "rekognition:DeleteFaces"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Students",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/AttendanceLogs",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/AttendanceLogs/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document file:///tmp/attendance-policy.json
echo "  Done: IAM role '$ROLE_NAME' with policy attached"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "  Role ARN: $ROLE_ARN"
echo "  (Save this — needed for Lambda deploy in Wave 2)"

# ─── 5. SES Email Verification ───────────────────────────────────────────────
echo "[5/6] Verifying SES email: $LEADER_EMAIL"
echo "  Add more emails by editing this script or running:"
echo "  aws ses verify-email-identity --email-address EMAIL --region $REGION"
aws ses verify-email-identity --email-address "$LEADER_EMAIL" --region "$REGION"
echo "  Check inbox for verification link — must click it before SES works."

# ─── 6. Billing Alarm ────────────────────────────────────────────────────────
echo "[6/6] Creating \$1 billing alarm in us-east-1..."
SNS_ARN=$(aws sns create-topic --name billing-alarm-topic --region us-east-1 --query TopicArn --output text)
aws sns subscribe \
  --topic-arn "$SNS_ARN" \
  --protocol email \
  --notification-endpoint "$LEADER_EMAIL" \
  --region us-east-1
aws cloudwatch put-metric-alarm \
  --alarm-name "BillingAlarm-1USD" \
  --alarm-description "Smart Attendance: alert when bill exceeds \$1" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=Currency,Value=USD \
  --evaluation-periods 1 \
  --alarm-actions "$SNS_ARN" \
  --region us-east-1
echo "  Done: billing alarm set. Check $LEADER_EMAIL to confirm SNS subscription."

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "================================================="
echo " Wave 1 Complete! Verify with:"
echo "================================================="
echo "  aws s3 ls | grep smart-attendance"
echo "  aws rekognition list-collections --region $REGION"
echo "  aws dynamodb list-tables --region $REGION"
echo "  aws iam get-role --role-name $ROLE_NAME"
echo ""
echo "  ROLE ARN (copy this for Wave 2):"
echo "  $ROLE_ARN"
echo "================================================="
