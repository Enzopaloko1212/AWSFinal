# Wave 4 Prompt — Frontend Layer

Use this prompt when starting Wave 4. Wave 3 must be complete first.
Paste into Claude Code or GitHub Copilot Chat.

---

## Context

You are building and deploying the Frontend Layer for a Smart Attendance System (Group 1, UA&P Advanced Cloud Computing).

**API Gateway Base URL:** `https://<API_ID>.execute-api.ap-southeast-1.amazonaws.com/prod`
*(paste the actual API_ID from Wave 3 output)*

**Region:** `ap-southeast-1`
**Frontend S3 Bucket:** `smart-attendance-frontend-782028084000`

## Architecture layer this wave creates

- **Frontend Layer** — Single `frontend/index.html` file served as a static website from S3.
  The client (student or admin) opens this in a browser. It makes HTTP calls to the API Layer (API Gateway) from Wave 3.
  No frameworks, no build tools — plain HTML + JavaScript only.

---

## Tab 1 — Register

**UI Elements:**
- Text input: Student ID
- Text input: Full Name
- Text input: Email address
- File input: Upload photo (accept image/*)
- Button: "Register"
- Status area: success or error message

**JS Logic:**
1. Read the photo file and convert to base64
2. POST to `{API_URL}/register` with `{studentId, name, email, photoBase64}`
3. Success: "Student [name] registered successfully"
4. Error: show message (face not detected, already exists, etc.)

---

## Tab 2 — Check In

**UI Elements:**
- Option to use webcam OR upload a photo
- Button: "Check In"
- Result area: matched student name + timestamp, or "Face not recognized"
- Green confirmation box on success

**JS Logic:**
1. Capture from webcam via `getUserMedia` OR read uploaded file
2. Convert photo to base64
3. POST to `{API_URL}/checkin` with `{photoBase64}`
4. 200 match: "Welcome, [name]! Attendance recorded at [timestamp]"
5. 404 no match: "Face not recognized. Please register first."

---

## Tab 3 — View Records

**UI Elements:**
- Text input: Student ID
- Date picker: From date
- Date picker: To date
- Button: "Search"
- Table: Date, Time, Status per record

**JS Logic:**
1. GET `{API_URL}/records?studentId=XXX&from=YYYY-MM-DD&to=YYYY-MM-DD`
2. Render results in an HTML table, sorted by timestamp ascending
3. "No records found" if empty
4. Show error if fetch fails

---

## Deploy to S3 Static Website

```bash
FRONTEND_BUCKET="smart-attendance-frontend-782028084000"
REGION="ap-southeast-1"

# 1. Remove public access block (was locked in Wave 1, now needed for static hosting)
aws s3api delete-public-access-block \
  --bucket $FRONTEND_BUCKET --region $REGION

# 2. Enable static website hosting
aws s3 website s3://$FRONTEND_BUCKET \
  --index-document index.html \
  --error-document index.html

# 3. Set public read policy
aws s3api put-bucket-policy \
  --bucket $FRONTEND_BUCKET \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::smart-attendance-frontend-782028084000/*"
    }]
  }'

# 4. Upload the frontend
aws s3 cp frontend/index.html s3://$FRONTEND_BUCKET/index.html

echo "Live URL: http://${FRONTEND_BUCKET}.s3-website-${REGION}.amazonaws.com"
```

**Live URL:**
`http://smart-attendance-frontend-782028084000.s3-website-ap-southeast-1.amazonaws.com`

---

## End-to-End Test Checklist

- [ ] Register a student with a clear photo → success message shown
- [ ] Check in using same person's photo → name + timestamp shown + confirmation email received
- [ ] Check in with unknown face → "Face not recognized" shown
- [ ] View records for registered student with date range → table shows correct entries
- [ ] View records with no matches → "No records found" shown
- [ ] CORS: all API calls succeed from the browser (no blocked by CORS errors in console)
- [ ] All 3 tabs work on mobile (responsive layout)

**Wave 4 is complete when:** All tabs work end-to-end, email confirmation received, live URL accessible. Demo ready.
