# Wave 2 Prompt — Lambda Functions

Use this prompt when starting Wave 2. Wave 1 must be complete first.
Paste into Claude Code or GitHub Copilot Chat.

---

## Prompt

You are writing and deploying the 3 Lambda functions for a Smart Attendance System (Group 1, UA&P Advanced Cloud Computing).

**My AWS Account ID:** `[PASTE ACCOUNT_ID HERE]`
**IAM Role ARN:** `arn:aws:iam::ACCOUNT_ID:role/lambda-attendance-role`
**Region:** `ap-southeast-1`
**Runtime:** Python 3.11

**Resource names in use:**
- S3 bucket: `smart-attendance-photos`
- Rekognition collection: `smart-attendance-faces`
- DynamoDB table: `Students`
- DynamoDB table: `AttendanceLogs` (GSI: `studentId-timestamp-index`)
- SES sender email: `[PASTE VERIFIED SENDER EMAIL]`

---

### Function 1 — register.py (RegisterStudent)

**Trigger:** POST /register
**Input (JSON body):**
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
3. Call Rekognition `IndexFaces` on the S3 object to register the face in collection `smart-attendance-faces`. Store `ExternalImageId = studentId`
4. Save student record to DynamoDB `Students` table: `{studentId, name, email, faceId, photoKey, registeredAt}`
5. Return success response

**Error handling:** Return 400 if face not detected, 409 if studentId already exists, 500 for AWS errors.

---

### Function 2 — checkin.py (CheckinStudent)

**Trigger:** POST /checkin
**Input (JSON body):**
```json
{
  "photoBase64": "base64-encoded image string"
}
```
**Logic:**
1. Decode base64 photo
2. Call Rekognition `SearchFacesByImage` against collection `smart-attendance-faces` (threshold: 90%)
3. If match found: get `ExternalImageId` (= studentId), look up student in DynamoDB `Students`
4. Write attendance log to `AttendanceLogs`: `{logId (UUID), studentId, name, timestamp (ISO8601), status: "present"}`
5. Send SES email to student's email: "Attendance confirmed for [name] at [timestamp]"
6. Return `{matched: true, studentId, name, timestamp}`

**Error handling:** Return 404 if no face match (confidence < 90%), 500 for AWS errors. Do NOT send email on failed match.

---

### Function 3 — get_records.py (GetAttendanceRecords)

**Trigger:** GET /records?studentId=XXX&from=YYYY-MM-DD&to=YYYY-MM-DD
**Input (query parameters):** `studentId`, `from`, `to`
**Logic:**
1. Query `AttendanceLogs` table using GSI `studentId-timestamp-index`
2. Filter by timestamp between `from` (start of day) and `to` (end of day)
3. Return list of attendance records sorted by timestamp ascending

**Error handling:** Return 400 if required params missing, 404 if no records found, 500 for AWS errors.

---

### Deploy Commands (run from project root)

```bash
# Package and deploy each function
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

zip checkin.zip checkin.py
aws lambda create-function \
  --function-name CheckinStudent \
  --runtime python3.11 \
  --role arn:aws:iam::ACCOUNT_ID:role/lambda-attendance-role \
  --handler checkin.handler \
  --zip-file fileb://checkin.zip \
  --timeout 30 \
  --region ap-southeast-1

zip get_records.zip get_records.py
aws lambda create-function \
  --function-name GetAttendanceRecords \
  --runtime python3.11 \
  --role arn:aws:iam::ACCOUNT_ID:role/lambda-attendance-role \
  --handler get_records.handler \
  --zip-file fileb://get_records.zip \
  --timeout 30 \
  --region ap-southeast-1
```

### Update after code changes:
```bash
zip register.zip register.py && aws lambda update-function-code --function-name RegisterStudent --zip-file fileb://register.zip --region ap-southeast-1
```

### Test each function (before API Gateway):
```bash
# Test RegisterStudent
aws lambda invoke \
  --function-name RegisterStudent \
  --payload '{"studentId":"test001","name":"Test User","email":"test@gmail.com","photoBase64":"[base64]"}' \
  --cli-binary-format raw-in-base64-out \
  response.json && cat response.json

# Test GetAttendanceRecords
aws lambda invoke \
  --function-name GetAttendanceRecords \
  --payload '{"queryStringParameters":{"studentId":"test001","from":"2026-01-01","to":"2026-12-31"}}' \
  --cli-binary-format raw-in-base64-out \
  response.json && cat response.json
```

**When Wave 2 is complete:** All 3 functions are deployed, individually tested, and returning correct responses. Move to Wave 3.
