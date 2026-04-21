# Smart Attendance System — AWS Infrastructure

**Group 1 | Advanced Cloud Computing | UA&P**
Region: `ap-southeast-1` (Singapore)
Deployment: AWS CLI only — no console clicking.

---

## Architecture Overview

```
                         ┌─────────────────────────────────────┐
                         │         Frontend (S3 Static)         │
                         │            index.html                │
                         └──────────────┬──────────────────────┘
                                        │ HTTPS
                         ┌──────────────▼──────────────────────┐
                         │         API Gateway (REST)           │
                         │  POST /register                      │
                         │  POST /checkin                       │
                         │  GET  /records                       │
                         └───┬──────────────┬───────────┬──────┘
                             │              │           │
               ┌─────────────▼──┐  ┌────────▼───┐  ┌──▼───────────┐
               │  register.py   │  │ checkin.py  │  │get_records.py│
               │  (Lambda)      │  │ (Lambda)    │  │ (Lambda)     │
               └──┬──────┬──────┘  └─┬────┬──┬──┘  └──────┬───────┘
                  │      │           │    │  │             │
            ┌─────▼─┐ ┌──▼──────┐   │ ┌──▼──▼──┐         │
            │  S3   │ │Rekog-   │   │ │DynamoDB│◄────────┘
            │Photos │ │nition   │◄──┘ │Students│
            │Bucket │ │IndexFaces    │Attendance│
            └───────┘ │SearchFaces│  │  Logs  │
                      └───────────┘  └────────┘
                                          │
                                     ┌────▼────┐
                                     │   SES   │
                                     │  Email  │
                                     └─────────┘
```

---

## AWS Services

| Service | Purpose | Free Tier Limit |
|---|---|---|
| S3 | Store student photos | 5 GB / month |
| Rekognition | Face detection + matching | 5,000 API calls / month (first 12 months) |
| Lambda | All backend logic | 1M requests / month |
| DynamoDB | Students + attendance logs | 25 GB, free forever |
| SES | Send confirmation emails | 3,000 emails / month (first 12 months) |
| API Gateway | Connect frontend to Lambda | 1M calls / month (first 12 months) |
| S3 (hosting) | Serve the frontend | 5 GB storage free |

---

## Resource Names (Canonical)

| Resource | Name / ID |
|---|---|
| S3 Photo Bucket | `smart-attendance-photos` |
| Rekognition Collection | `smart-attendance-faces` |
| DynamoDB Table 1 | `Students` |
| DynamoDB Table 2 | `AttendanceLogs` |
| IAM Role | `lambda-attendance-role` |
| IAM Policy | `lambda-attendance-policy` |
| Lambda Function 1 | `RegisterStudent` |
| Lambda Function 2 | `CheckinStudent` |
| Lambda Function 3 | `GetAttendanceRecords` |
| API Gateway | `SmartAttendanceAPI` |
| S3 Frontend Bucket | `smart-attendance-frontend` |

---

## Wave 1 — Infrastructure Setup (CLI Commands)

> **Before running:** fill in `ACCOUNT_ID` in `scripts/setup-infra.sh` once your teammate shares the AWS account details.
> Run the script from the VSCode terminal (Git Bash).

### 1.1 — S3 Bucket for Photos

```bash
aws s3api create-bucket \
  --bucket smart-attendance-photos \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1

# Block all public access (photos should NOT be public)
aws s3api put-public-access-block \
  --bucket smart-attendance-photos \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 1.2 — Rekognition Face Collection

```bash
aws rekognition create-collection \
  --collection-id smart-attendance-faces \
  --region ap-southeast-1
```

### 1.3 — DynamoDB Tables

```bash
# Students table — primary key: studentId (string)
aws dynamodb create-table \
  --table-name Students \
  --attribute-definitions AttributeName=studentId,AttributeType=S \
  --key-schema AttributeName=studentId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-1

# AttendanceLogs table — primary key: logId (string)
aws dynamodb create-table \
  --table-name AttendanceLogs \
  --attribute-definitions \
    AttributeName=logId,AttributeType=S \
    AttributeName=studentId,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema AttributeName=logId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "studentId-timestamp-index",
      "KeySchema": [
        {"AttributeName": "studentId", "KeyType": "HASH"},
        {"AttributeName": "timestamp", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]' \
  --region ap-southeast-1
```

> The GSI on `AttendanceLogs` lets `get_records.py` query by `studentId` + date range efficiently.

### 1.4 — IAM Role for Lambda

```bash
# Trust policy — allows Lambda service to assume this role
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

# Create the role
aws iam create-role \
  --role-name lambda-attendance-role \
  --assume-role-policy-document file:///tmp/trust-policy.json

# Permissions policy — S3 + Rekognition + DynamoDB + SES + CloudWatch Logs
cat > /tmp/attendance-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::smart-attendance-photos/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:DeleteFaces"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-southeast-1:*:table/Students",
        "arn:aws:dynamodb:ap-southeast-1:*:table/AttendanceLogs",
        "arn:aws:dynamodb:ap-southeast-1:*:table/AttendanceLogs/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
EOF

# Attach inline policy to role
aws iam put-role-policy \
  --role-name lambda-attendance-role \
  --policy-name lambda-attendance-policy \
  --policy-document file:///tmp/attendance-policy.json
```

### 1.5 — SES Email Verification (Sandbox Mode)

> SES sandbox = you can ONLY send to verified emails. Verify every teammate's email.

```bash
# Run this once per email address
aws ses verify-email-identity --email-address leorenzo@example.com --region ap-southeast-1
aws ses verify-email-identity --email-address levi@example.com --region ap-southeast-1
aws ses verify-email-identity --email-address lanz@example.com --region ap-southeast-1
aws ses verify-email-identity --email-address ted@example.com --region ap-southeast-1
aws ses verify-email-identity --email-address deejay@example.com --region ap-southeast-1
aws ses verify-email-identity --email-address jules@example.com --region ap-southeast-1
aws ses verify-email-identity --email-address raymond@example.com --region ap-southeast-1
# Replace with real email addresses — each person must click the verification link in their inbox
```

### 1.6 — Billing Alarm ($1 threshold)

```bash
# Create SNS topic for alarm notifications
aws sns create-topic --name billing-alarm-topic --region us-east-1

# Subscribe your email to the topic (replace with leader email)
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:billing-alarm-topic \
  --protocol email \
  --notification-endpoint leorenzo@example.com \
  --region us-east-1

# Create the billing alarm (billing metrics are always in us-east-1)
aws cloudwatch put-metric-alarm \
  --alarm-name "BillingAlarm-1USD" \
  --alarm-description "Alert when AWS bill exceeds $1" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=Currency,Value=USD \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:billing-alarm-topic \
  --region us-east-1
```

---

## Wave 2 — Lambda Functions

> See `scripts/setup-infra.sh` for deploy commands.
> Fill in `ACCOUNT_ID` and `ROLE_ARN` before running.

### Functions

| File | Lambda Name | Trigger |
|---|---|---|
| `backend/register.py` | `RegisterStudent` | POST /register |
| `backend/checkin.py` | `CheckinStudent` | POST /checkin |
| `backend/get_records.py` | `GetAttendanceRecords` | GET /records |

### Deploy Template (per function)

```bash
# From project root
cd backend
zip register.zip register.py

aws lambda create-function \
  --function-name RegisterStudent \
  --runtime python3.11 \
  --role arn:aws:iam::ACCOUNT_ID:role/lambda-attendance-role \
  --handler register.handler \
  --zip-file fileb://register.zip \
  --timeout 30 \
  --region ap-southeast-1

# To update after code changes:
aws lambda update-function-code \
  --function-name RegisterStudent \
  --zip-file fileb://register.zip \
  --region ap-southeast-1
```

---

## Wave 3 — API Gateway

```bash
# Create REST API
aws apigateway create-rest-api \
  --name SmartAttendanceAPI \
  --region ap-southeast-1

# After creation, note the API ID — needed for all subsequent commands
# export API_ID=<value from above>

# Get root resource ID
# aws apigateway get-resources --rest-api-id $API_ID --region ap-southeast-1

# Routes to create: POST /register, POST /checkin, GET /records
# Each route needs: create-resource → put-method → put-integration → enable CORS
# See scripts/setup-infra.sh for full commands with variables filled in
```

---

## Wave 4 — Frontend Hosting

```bash
# Create frontend S3 bucket
aws s3api create-bucket \
  --bucket smart-attendance-frontend \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1

# Enable static website hosting
aws s3 website s3://smart-attendance-frontend \
  --index-document index.html \
  --error-document index.html

# Make bucket publicly readable (frontend only — not photo bucket)
aws s3api put-bucket-policy \
  --bucket smart-attendance-frontend \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::smart-attendance-frontend/*"
    }]
  }'

# Deploy frontend
aws s3 cp frontend/index.html s3://smart-attendance-frontend/index.html

# Access URL: http://smart-attendance-frontend.s3-website-ap-southeast-1.amazonaws.com
```

---

## Verification Commands

Run these after Wave 1 to confirm everything is set up:

```bash
# Check S3 bucket exists
aws s3 ls | grep smart-attendance

# Check Rekognition collection
aws rekognition list-collections --region ap-southeast-1

# Check DynamoDB tables
aws dynamodb list-tables --region ap-southeast-1

# Check IAM role
aws iam get-role --role-name lambda-attendance-role

# Check SES verified emails
aws ses list-identities --region ap-southeast-1
```

---

## Gotchas

| Issue | What happens | Fix |
|---|---|---|
| SES sandbox | Can only send to verified emails | Verify ALL test emails before Wave 2 |
| CORS not enabled | Frontend gets blocked by browser | Enable CORS on every API Gateway route |
| Lambda missing IAM permissions | Function throws AccessDenied | Attach policy before deploying functions |
| Rekognition blurry photo | `InvalidParameterException` | Use well-lit, single-face, clear photos for testing |
| Rekognition quota | 5,000 calls/month | Don't spam test calls — test once per scenario |
| Billing alarm in us-east-1 | Billing metrics only exist in us-east-1 | SNS topic + alarm must be in us-east-1, not ap-southeast-1 |
| S3 bucket name globally unique | `BucketAlreadyExists` | If taken, append a short suffix e.g. `smart-attendance-photos-g1` |

---

## Team Assignments

| Member | Responsibility |
|---|---|
| Leorenzo (Leader) | AWS account, IAM users, billing alarm, run setup-infra.sh |
| Levi (Asst. Lead) | Rekognition logic, IndexFaces + SearchFaces in register.py + checkin.py |
| Lanz | S3 upload logic in register.py, CORS config |
| Ted | All 3 Lambda functions, API Gateway wiring, endpoint testing |
| Deejay | DynamoDB queries, date range filter in get_records.py |
| Jules | SES setup, email template, integration in checkin.py |
| Raymond | Frontend HTML/JS (all 3 tabs), connect to API Gateway, S3 deploy |
