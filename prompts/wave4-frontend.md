# Wave 4 Prompt — Frontend

Use this prompt when starting Wave 4. Wave 3 must be complete first.
Paste into Claude Code or GitHub Copilot Chat.

---

## Prompt

You are building and deploying the frontend for a Smart Attendance System (Group 1, UA&P Advanced Cloud Computing).

**API Gateway Base URL:** `[PASTE API URL HERE]`
e.g. `https://XXXXXXXX.execute-api.ap-southeast-1.amazonaws.com/prod`

**Region:** `ap-southeast-1`
**Frontend S3 Bucket:** `smart-attendance-frontend`

---

### Goal

Build a single `frontend/index.html` file with 3 tabs and deploy it to S3 static website hosting. Plain HTML + JavaScript only — no frameworks, no build tools.

---

### Tab 1 — Register

**UI Elements:**
- Text input: Student ID
- Text input: Full Name
- Text input: Email address
- File input: Upload photo (accept image/*)
- Button: "Register"
- Status area: shows success or error message

**JS Logic:**
1. On button click, read the photo file and convert to base64
2. POST to `{API_URL}/register` with `{studentId, name, email, photoBase64}`
3. Show success: "Student [name] registered successfully"
4. Show error message if registration fails (face not detected, already exists, etc.)

---

### Tab 2 — Check In

**UI Elements:**
- Option to use webcam OR upload photo
- Button: "Check In" 
- Result area: shows matched student name + timestamp, or "Face not recognized"
- On success: show green confirmation box

**JS Logic:**
1. Capture photo from webcam (via `getUserMedia`) OR read uploaded file
2. Convert photo to base64
3. POST to `{API_URL}/checkin` with `{photoBase64}`
4. On match (200): show "Welcome, [name]! Attendance recorded at [timestamp]"
5. On no match (404): show "Face not recognized. Please register first."

---

### Tab 3 — View Records

**UI Elements:**
- Text input: Student ID
- Date picker: From date
- Date picker: To date
- Button: "Search"
- Table: shows Date, Time, Status for each record

**JS Logic:**
1. On button click, GET `{API_URL}/records?studentId=XXX&from=YYYY-MM-DD&to=YYYY-MM-DD`
2. Render results in a clean HTML table
3. Show "No records found" if empty
4. Show error if fetch fails

---

### Deploy to S3

```bash
# Create frontend bucket
aws s3api create-bucket \
  --bucket smart-attendance-frontend \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1

# Enable static website hosting
aws s3 website s3://smart-attendance-frontend \
  --index-document index.html \
  --error-document index.html

# Set public read policy
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

# Remove public access block (required for public policy to work)
aws s3api delete-public-access-block --bucket smart-attendance-frontend

# Upload
aws s3 cp frontend/index.html s3://smart-attendance-frontend/index.html
```

**Live URL:** `http://smart-attendance-frontend.s3-website-ap-southeast-1.amazonaws.com`

---

### End-to-End Test Checklist

- [ ] Register a student with a clear photo → success message shown
- [ ] Check in using same person's photo → name + timestamp shown + email received
- [ ] Check in with an unknown face → "Face not recognized" shown
- [ ] View records for registered student with date range → table shows correct entries
- [ ] View records with no matches → "No records found" shown
- [ ] All 3 tabs work on mobile (responsive)

**When Wave 4 is complete:** All tabs work end-to-end, email confirmation received, live URL accessible. Demo ready.
