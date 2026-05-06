# Wave 2 Prompt — Compute Layer (Lambda Functions)

Use this prompt when starting Wave 2. Wave 1 must be complete first.
Paste into Claude Code or GitHub Copilot Chat.

---

## Context

You are building and deploying the Compute Layer for a Smart Attendance System (Group 1, UA&P Advanced Cloud Computing).

**Account ID:** `782028084000`
**Region:** `ap-southeast-1`
**Runtime:** Python 3.11
**IAM Role ARN:** `arn:aws:iam::782028084000:role/lambda-attendance-role`

**Resources already deployed (Wave 1):**
- S3 photo bucket: `smart-attendance-photos-782028084000`
- Rekognition collection: `smart-attendance-faces`
- DynamoDB table: `Students`
- DynamoDB table: `AttendanceLogs` (GSI: `studentId-timestamp-index`)
- SES sender: `lanz.reddamien456@gmail.com`

## Architecture layers this wave creates

- **Compute Layer** — 3 Lambda functions that contain all business logic
  - `RegisterStudent` — receives student data + photo, talks to AI Layer (Rekognition) + Data Layer (S3, DynamoDB)
  - `CheckinStudent` — receives photo, talks to AI Layer (Rekognition), Data Layer (DynamoDB), Notification Layer (SES)
  - `GetAttendanceRecords` — queries Data Layer (DynamoDB AttendanceLogs GSI)

---

## Function 1 — register.py (RegisterStudent)

**Trigger:** POST /register (wired in Wave 3)
**Input:**
```json
{
  "studentId": "string",
  "name": "string",
  "email": "string",
  "photoBase64": "base64-encoded image string"
}
```
**Logic:**
1. Decode base64 photo
2. Upload photo to S3 as `photos/{studentId}.jpg`
3. Call Rekognition `IndexFaces` on the S3 object — store `ExternalImageId = studentId`
4. Save student record to DynamoDB `Students`: `{studentId, name, email, faceId, photoKey, registeredAt}`
5. Return success response

**Errors:** 400 if no face detected, 409 if studentId already exists, 500 for AWS errors.

---

## Function 2 — checkin.py (CheckinStudent)

**Trigger:** POST /checkin (wired in Wave 3)
**Input:**
```json
{
  "photoBase64": "base64-encoded image string"
}
```
**Logic:**
1. Decode base64 photo
2. Call Rekognition `SearchFacesByImage` against `smart-attendance-faces` (threshold: 90%)
3. Get `ExternalImageId` (= studentId) from match, look up student in `Students` table
4. Write to `AttendanceLogs`: `{logId (UUID), studentId, name, timestamp (ISO8601), status: "present"}`
5. Send SES email to student's email: "Attendance confirmed for [name] at [timestamp]"
6. Return `{matched: true, studentId, name, timestamp, confidence}`

**Errors:** 404 if no face match above threshold, 500 for AWS errors. No email on failed match.

---

## Function 3 — get_records.py (GetAttendanceRecords)

**Trigger:** GET /records?studentId=XXX&from=YYYY-MM-DD&to=YYYY-MM-DD (wired in Wave 3)
**Input:** query parameters `studentId`, `from`, `to`
**Logic:**
1. Query `AttendanceLogs` using GSI `studentId-timestamp-index`
2. Filter timestamps between `from` (start of day) and `to` (end of day)
3. Return records sorted by timestamp ascending

**Errors:** 400 if params missing, 404 if no records, 500 for AWS errors.

---

## Deploy Commands

```bash
cd backend

# Windows — use PowerShell to zip (no zip command in Git Bash on Windows)
powershell -Command "Compress-Archive -Path register.py -DestinationPath register.zip -Force"
aws lambda create-function \
  --function-name RegisterStudent \
  --runtime python3.11 \
  --role arn:aws:iam::782028084000:role/lambda-attendance-role \
  --handler register.handler \
  --zip-file fileb://register.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment "Variables={REGION=ap-southeast-1,PHOTO_BUCKET=smart-attendance-photos-782028084000,COLLECTION_ID=smart-attendance-faces,STUDENTS_TABLE=Students}" \
  --region ap-southeast-1

powershell -Command "Compress-Archive -Path checkin.py -DestinationPath checkin.zip -Force"
aws lambda create-function \
  --function-name CheckinStudent \
  --runtime python3.11 \
  --role arn:aws:iam::782028084000:role/lambda-attendance-role \
  --handler checkin.handler \
  --zip-file fileb://checkin.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment "Variables={REGION=ap-southeast-1,COLLECTION_ID=smart-attendance-faces,STUDENTS_TABLE=Students,LOGS_TABLE=AttendanceLogs,SES_SENDER=lanz.reddamien456@gmail.com,MATCH_THRESHOLD=90}" \
  --region ap-southeast-1

powershell -Command "Compress-Archive -Path get_records.py -DestinationPath get_records.zip -Force"
aws lambda create-function \
  --function-name GetAttendanceRecords \
  --runtime python3.11 \
  --role arn:aws:iam::782028084000:role/lambda-attendance-role \
  --handler get_records.handler \
  --zip-file fileb://get_records.zip \
  --timeout 30 \
  --memory-size 256 \
  --environment "Variables={REGION=ap-southeast-1,LOGS_TABLE=AttendanceLogs,GSI_NAME=studentId-timestamp-index}" \
  --region ap-southeast-1
```

To update after code changes:
```bash
powershell -Command "Compress-Archive -Path register.py -DestinationPath register.zip -Force"
aws lambda update-function-code --function-name RegisterStudent --zip-file fileb://register.zip --region ap-southeast-1
```

---

## Verify

```bash
# Check all 3 are Active
for fn in RegisterStudent CheckinStudent GetAttendanceRecords; do
  aws lambda get-function-configuration --function-name $fn --region ap-southeast-1 \
    --query '{Name:FunctionName,State:State,LastUpdate:LastUpdateStatus}'
done

# Smoke test — GetAttendanceRecords (expects 404 empty, confirms DynamoDB wiring works)
aws lambda invoke \
  --function-name GetAttendanceRecords \
  --payload '{"queryStringParameters":{"studentId":"test001","from":"2026-01-01","to":"2026-12-31"}}' \
  --cli-binary-format raw-in-base64-out \
  --region ap-southeast-1 \
  response.json && cat response.json && rm response.json

# Smoke test — RegisterStudent missing fields (expects 400)
aws lambda invoke \
  --function-name RegisterStudent \
  --payload '{"body":"{\"studentId\":\"test001\"}"}' \
  --cli-binary-format raw-in-base64-out \
  --region ap-southeast-1 \
  response.json && cat response.json && rm response.json
```

---

## Outputs needed for Wave 3

- `RegisterStudent` ARN: `arn:aws:lambda:ap-southeast-1:782028084000:function:RegisterStudent`
- `CheckinStudent` ARN: `arn:aws:lambda:ap-southeast-1:782028084000:function:CheckinStudent`
- `GetAttendanceRecords` ARN: `arn:aws:lambda:ap-southeast-1:782028084000:function:GetAttendanceRecords`

**Wave 2 is complete when:** All 3 functions are Active, smoke tests return expected status codes. Move to Wave 3.
