# Smart Attendance System — AWS Infrastructure

**Group 1 | Advanced Cloud Computing | UA&P**
Region: `ap-southeast-1` (Singapore)
Account: `782028084000`
Deployment: AWS CLI only — no console clicking.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND LAYER                                          │
│  Web Application (index.html)                            │
│  Served by: S3 Bucket smart-attendance-frontend-782...   │
└────────────────────────┬────────────────────────────────┘
                         │ GET/POST (HTTPS)
┌────────────────────────▼────────────────────────────────┐
│  API LAYER                                               │
│  API Gateway — SmartAttendanceAPI                        │
│  POST /register  |  POST /checkin  |  GET /records       │
└──────┬─────────────────┬──────────────────┬─────────────┘
       │ routes to       │ routes to        │ routes to
┌──────▼──────┐  ┌───────▼──────┐  ┌────────▼────────────┐
│  COMPUTE LAYER                                           │
│  RegisterStudent  CheckinStudent  GetAttendanceRecords   │
│  (register.py)    (checkin.py)    (get_records.py)       │
└──────┬──────┘  └───────┬──────┘  └────────┬────────────┘
       │                 │                  │
       │  ┌──────────────┤                  │
       │  │              │                  │
┌──────▼──▼──┐  ┌────────▼────────┐  ┌─────▼──────────────┐
│  AI LAYER  │  │  DATA LAYER                               │
│  Amazon    │  │  DynamoDB          S3 Bucket              │
│  Rekognition│ │  Students Table    smart-attendance-photos│
│  smart-    │  │  AttendanceLogs    -782028084000           │
│  attendance│  │  Table + GSI                              │
│  -faces    │  │  (studentId-timestamp-index)              │
└────────────┘  └───────────────────────────────────────────┘
                         │
               ┌─────────▼──────────┐
               │  NOTIFICATION LAYER │
               │  Amazon SES         │
               │  Email Service      │
               └────────────────────┘

SECURITY LAYER (cross-cutting)
IAM Role: lambda-attendance-role
IAM Policy: lambda-attendance-policy
Grants permissions to all Lambda functions above
```

---

## Layers & Services

| Layer | Service | Purpose |
|---|---|---|
| Frontend | S3 Static Website | Serves `index.html` — 3-tab web app |
| API | API Gateway REST | Routes HTTP requests to Lambda |
| Compute | Lambda (×3) | All backend logic |
| AI | Amazon Rekognition | Face indexing (`IndexFaces`) + matching (`SearchFacesByImage`) |
| Data | DynamoDB `Students` | Student profile storage |
| Data | DynamoDB `AttendanceLogs` | Attendance log storage with GSI |
| Data | S3 `smart-attendance-photos-782028084000` | Student photo storage |
| Notification | Amazon SES | Sends attendance confirmation emails |
| Security | IAM Role + Policy | Grants Lambda permissions to all services above |

---

## Canonical Resource Names

| Resource | Deployed Name |
|---|---|
| S3 Photo Bucket | `smart-attendance-photos-782028084000` |
| S3 Frontend Bucket | `smart-attendance-frontend-782028084000` |
| Rekognition Collection | `smart-attendance-faces` |
| DynamoDB Table 1 | `Students` |
| DynamoDB Table 2 | `AttendanceLogs` |
| DynamoDB GSI | `studentId-timestamp-index` |
| IAM Role | `lambda-attendance-role` |
| IAM Policy | `lambda-attendance-policy` |
| Lambda 1 | `RegisterStudent` |
| Lambda 2 | `CheckinStudent` |
| Lambda 3 | `GetAttendanceRecords` |
| API Gateway | `SmartAttendanceAPI` |
| SES Sender | `lanz.reddamien456@gmail.com` |

---

## Free Tier Limits

| Service | Free Tier |
|---|---|
| S3 | 5 GB / month |
| Rekognition | 5,000 API calls / month (first 12 months) |
| Lambda | 1M requests / month forever |
| DynamoDB | 25 GB storage, free forever |
| SES | 3,000 emails / month (first 12 months) |
| API Gateway | 1M calls / month (first 12 months) |

---

## Wave 1 — Infrastructure (✅ Complete)

Resources deployed via `scripts/setup-infra.sh`:

1. S3 photo bucket `smart-attendance-photos-782028084000` (public access blocked)
2. S3 frontend bucket `smart-attendance-frontend-782028084000` (public access blocked until Wave 4)
3. Rekognition collection `smart-attendance-faces` (model v7.0)
4. DynamoDB `Students` (PK: studentId, PAY_PER_REQUEST)
5. DynamoDB `AttendanceLogs` (PK: logId, GSI: studentId-timestamp-index, PAY_PER_REQUEST)
6. IAM role `lambda-attendance-role` + inline policy `lambda-attendance-policy`
7. SES sender verified: `lanz.reddamien456@gmail.com`
8. CloudWatch billing alarm `BillingAlarm-1USD` (SNS → email, us-east-1)

---

## Wave 2 — Compute Layer (✅ Complete)

Three Lambda functions deployed to `ap-southeast-1`, Python 3.11, role `lambda-attendance-role`:

| File | Lambda Name | Trigger | Purpose |
|---|---|---|---|
| `backend/register.py` | `RegisterStudent` | POST /register | Uploads photo → S3, indexes face → Rekognition, saves student → DynamoDB |
| `backend/checkin.py` | `CheckinStudent` | POST /checkin | Matches face → Rekognition, logs attendance → DynamoDB, sends email → SES |
| `backend/get_records.py` | `GetAttendanceRecords` | GET /records | Queries AttendanceLogs GSI by studentId + date range |

Update a function after code changes:
```bash
cd backend
powershell -Command "Compress-Archive -Path <file>.py -DestinationPath <file>.zip -Force"
aws lambda update-function-code --function-name <FunctionName> --zip-file fileb://<file>.zip --region ap-southeast-1
```

---

## Wave 3 — API Layer (⬜ Pending)

Create REST API in API Gateway, wire 3 routes to Lambdas, enable CORS.

```bash
REGION="ap-southeast-1"
ACCOUNT_ID="782028084000"

# 1. Create REST API
API_ID=$(aws apigateway create-rest-api \
  --name SmartAttendanceAPI \
  --region $REGION \
  --query id --output text)
echo "API_ID=$API_ID"

# 2. Get root resource
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID --region $REGION \
  --query 'items[?path==`/`].id' --output text)

# 3–6 repeated for each route: /register (POST), /checkin (POST), /records (GET)
# See prompts/wave3-api-gateway.md for full commands

# Final: deploy to prod stage
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

# Live URL: https://${API_ID}.execute-api.ap-southeast-1.amazonaws.com/prod
```

---

## Wave 4 — Frontend Layer (⬜ Pending)

Build `frontend/index.html` (3-tab UI), deploy to S3 static website.

```bash
FRONTEND_BUCKET="smart-attendance-frontend-782028084000"

# Open public access (blocked in Wave 1, needed now for static hosting)
aws s3api delete-public-access-block --bucket $FRONTEND_BUCKET --region ap-southeast-1

# Enable static website hosting
aws s3 website s3://$FRONTEND_BUCKET \
  --index-document index.html \
  --error-document index.html

# Set public read policy
aws s3api put-bucket-policy \
  --bucket $FRONTEND_BUCKET \
  --policy '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject",
    "Resource":"arn:aws:s3:::smart-attendance-frontend-782028084000/*"}]
  }'

# Upload
aws s3 cp frontend/index.html s3://$FRONTEND_BUCKET/index.html

# Live URL:
# http://smart-attendance-frontend-782028084000.s3-website-ap-southeast-1.amazonaws.com
```

---

## Gotchas

| Issue | Fix |
|---|---|
| SES sandbox | Can only send to verified emails — verify all test emails before Wave 2 |
| CORS not enabled | Enable CORS on every API Gateway route or browser blocks requests |
| Lambda permissions | Role must be attached before deploying functions |
| Rekognition blurry photo | Use well-lit, single-face, forward-facing photos |
| Billing alarm in us-east-1 | Billing metrics only exist in us-east-1 — keep SNS + alarm there |
| Bucket name suffix | Bucket names have `-782028084000` suffix for global uniqueness |

---

## Team Assignments

| Member | Layer | Responsibility |
|---|---|---|
| Leorenzo (Leader) | Security | AWS account, IAM users, billing alarm, `setup-infra.sh` |
| Levi (Asst. Lead) | AI | Rekognition logic — `IndexFaces` + `SearchFaces` in `register.py` + `checkin.py` |
| Lanz | Compute + API | S3 upload logic in `register.py`, CORS config |
| Ted | Compute + API | All 3 Lambda functions, API Gateway wiring, endpoint testing |
| Deejay | Data | DynamoDB queries, date range filter in `get_records.py` |
| Jules | Notification | SES setup, email template, integration in `checkin.py` |
| Raymond | Frontend | `index.html` (all 3 tabs), connect to API Gateway, S3 deploy |
