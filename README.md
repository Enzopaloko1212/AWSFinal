# Smart Attendance System
**Group 1 | Advanced Cloud Computing | UA&P**

Face-recognition attendance system built on AWS serverless stack.

---

## What It Does

| Feature | Flow |
|---|---|
| Register | Student uploads photo → S3 → Rekognition IndexFaces → DynamoDB |
| Check-in | Student takes photo → Rekognition match → DynamoDB log → SES email |
| Records | Student picks date range → DynamoDB query → attendance history |

---

## Stack

- **Frontend** — Plain HTML + JS, hosted on S3 static website
- **Backend** — Python Lambda functions (register, checkin, get_records)
- **Database** — DynamoDB (Students + AttendanceLogs tables)
- **Face AI** — AWS Rekognition
- **Email** — AWS SES
- **API** — API Gateway (REST)
- **Region** — ap-southeast-1 (Singapore)

---

## Project Structure

```
AWSFinal/
├── infrastructure/
│   └── INFRASTRUCTURE.md     ← Full AWS architecture + CLI commands
├── backend/
│   ├── register.py           ← Lambda: register student
│   ├── checkin.py            ← Lambda: face check-in + email
│   └── get_records.py        ← Lambda: query attendance records
├── frontend/
│   └── index.html            ← Single-page app (3 tabs)
├── scripts/
│   ├── setup-infra.sh        ← Wave 1: create all AWS resources
│   └── deploy-lambdas.sh     ← Wave 2: zip + deploy Lambda functions
├── prompts/
│   ├── wave1-infra.md        ← AI prompt for infrastructure setup
│   ├── wave2-lambdas.md      ← AI prompt for Lambda functions
│   ├── wave3-api-gateway.md  ← AI prompt for API Gateway
│   └── wave4-frontend.md     ← AI prompt for frontend
├── docs/
│   └── smart-attendance-build-plan.pdf   ← Original team build plan
└── README.md
```

---

## Quick Start

### Prerequisites
- AWS CLI installed and configured (`aws configure`)
- Git Bash or WSL (for running .sh scripts on Windows)
- Python 3.11+

### Step 1 — Fill in your AWS Account ID

Edit `scripts/setup-infra.sh` and set:
```bash
ACCOUNT_ID="your-12-digit-account-id"
LEADER_EMAIL="your-email@gmail.com"
```

### Step 2 — Run Wave 1 (Infrastructure)

```bash
bash scripts/setup-infra.sh
```

### Step 3 — Verify

```bash
aws s3 ls | grep smart-attendance
aws rekognition list-collections --region ap-southeast-1
aws dynamodb list-tables --region ap-southeast-1
aws iam get-role --role-name lambda-attendance-role
```

### Step 4 — Continue with Wave 2+

See `infrastructure/INFRASTRUCTURE.md` for full wave-by-wave instructions.
See `prompts/` folder for AI prompts for each wave.

---

## Team Assignments

| Member | Task |
|---|---|
| Leorenzo (Leader) | AWS account, IAM, billing alarm, run setup-infra.sh |
| Levi (Asst. Lead) | Rekognition logic (IndexFaces + SearchFaces) |
| Lanz | S3 upload logic, CORS config |
| Ted | All 3 Lambda functions, API Gateway wiring |
| Deejay | DynamoDB queries, date range filter |
| Jules | SES setup, email templates |
| Raymond | Frontend HTML/JS, S3 static hosting |

---

## Important Notes

- All AWS resources are created via CLI — no console clicking
- No credentials are hardcoded — use `aws configure` or environment variables
- SES is in sandbox mode by default — verify ALL team emails before testing check-in
- Set $1 billing alarm on Day 1 (script does this automatically)
- Do NOT spam Rekognition test calls — 5,000/month limit
