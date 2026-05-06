# Wave 1 Prompt — Infrastructure Setup

Use this prompt when starting Wave 1. Paste into Claude Code or GitHub Copilot Chat.

---

## Context

You are setting up the AWS infrastructure for a Smart Attendance System (Group 1, UA&P Advanced Cloud Computing).

**Account ID:** `782028084000`
**Region:** `ap-southeast-1` (Singapore)
**Rule:** Everything via AWS CLI only — no console clicking.

## Architecture layers this wave creates

- **Security Layer** — IAM role + policy that grants Lambda permission to all services
- **Data Layer** — DynamoDB `Students` table, DynamoDB `AttendanceLogs` table (with GSI), S3 photo bucket
- **AI Layer** — Rekognition face collection
- **Notification Layer** — SES email identity verified
- **Frontend Layer** — S3 frontend bucket (created now, opened up in Wave 4)
- **Cost control** — CloudWatch billing alarm at $1 threshold

---

## Steps

Run `scripts/setup-infra.sh` from the project root in Git Bash. The script is already filled in with the correct values. It creates:

1. S3 bucket `smart-attendance-photos-782028084000` (public access blocked — photo storage)
2. S3 bucket `smart-attendance-frontend-782028084000` (public access blocked until Wave 4)
3. Rekognition collection `smart-attendance-faces`
4. DynamoDB table `Students` (PK: studentId)
5. DynamoDB table `AttendanceLogs` (PK: logId, GSI: studentId-timestamp-index)
6. IAM role `lambda-attendance-role` + inline policy `lambda-attendance-policy`
7. SES email verification for `lanz.reddamien456@gmail.com`
8. CloudWatch billing alarm `BillingAlarm-1USD` via SNS (in us-east-1)

```bash
bash scripts/setup-infra.sh
```

---

## Verify

```bash
# Data Layer — buckets
aws s3 ls | grep smart-attendance

# AI Layer — Rekognition
aws rekognition list-collections --region ap-southeast-1

# Data Layer — DynamoDB
aws dynamodb list-tables --region ap-southeast-1

# Security Layer — IAM
aws iam get-role --role-name lambda-attendance-role
aws iam list-role-policies --role-name lambda-attendance-role

# Notification Layer — SES
aws ses get-identity-verification-attributes \
  --identities lanz.reddamien456@gmail.com --region ap-southeast-1

# Cost control — billing alarm
aws cloudwatch describe-alarms --alarm-names BillingAlarm-1USD --region us-east-1
```

To verify additional teammate emails with SES:
```bash
aws ses verify-email-identity --email-address TEAMMATE_EMAIL --region ap-southeast-1
```
Each teammate must click the verification link in their inbox before Wave 2.

---

## Outputs needed for Wave 2

- **Role ARN:** `arn:aws:iam::782028084000:role/lambda-attendance-role`
- **Photo bucket:** `smart-attendance-photos-782028084000`
- **Rekognition collection:** `smart-attendance-faces`
- **DynamoDB tables:** `Students`, `AttendanceLogs`
- **SES sender:** `lanz.reddamien456@gmail.com`

**Wave 1 is complete when:** all resources exist, SES is verified, billing alarm active. Move to Wave 2.
