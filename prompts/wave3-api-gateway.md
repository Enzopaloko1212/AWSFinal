# Wave 3 Prompt — API Gateway

Use this prompt when starting Wave 3. Wave 2 must be complete first.
Paste into Claude Code or GitHub Copilot Chat.

---

## Prompt

You are wiring up API Gateway for a Smart Attendance System (Group 1, UA&P Advanced Cloud Computing).

**My AWS Account ID:** `[PASTE ACCOUNT_ID HERE]`
**Region:** `ap-southeast-1`
**API Name:** `SmartAttendanceAPI`

**Lambda functions already deployed:**
- `RegisterStudent` → POST /register
- `CheckinStudent` → POST /checkin
- `GetAttendanceRecords` → GET /records

---

### Goal

Create one REST API in API Gateway with 3 routes, each triggering its Lambda function. Enable CORS on all routes so the frontend can call them from a browser.

---

### Step-by-Step CLI Commands

```bash
REGION="ap-southeast-1"
ACCOUNT_ID="[YOUR_ACCOUNT_ID]"

# 1. Create REST API
API_ID=$(aws apigateway create-rest-api \
  --name SmartAttendanceAPI \
  --region $REGION \
  --query id --output text)
echo "API ID: $API_ID"

# 2. Get root resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --region $REGION \
  --query 'items[?path==`/`].id' --output text)

# 3. Create /register resource
REGISTER_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part register \
  --region $REGION \
  --query id --output text)

# 4. Create POST method on /register
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $REGISTER_ID \
  --http-method POST \
  --authorization-type NONE \
  --region $REGION

# 5. Wire POST /register → RegisterStudent Lambda
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $REGISTER_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:RegisterStudent/invocations" \
  --region $REGION

# 6. Grant API Gateway permission to invoke RegisterStudent
aws lambda add-permission \
  --function-name RegisterStudent \
  --statement-id apigateway-register \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/POST/register" \
  --region $REGION

# Repeat steps 3-6 for /checkin (POST → CheckinStudent)
# Repeat steps 3-6 for /records (GET → GetAttendanceRecords)

# 7. Enable CORS on each resource (OPTIONS method + response headers)
# For each resource, add OPTIONS method with response headers:
#   Access-Control-Allow-Origin: '*'
#   Access-Control-Allow-Headers: 'Content-Type,X-Amz-Date,Authorization,X-Api-Key'
#   Access-Control-Allow-Methods: 'POST,GET,OPTIONS'

# 8. Deploy the API
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

echo "API URL: https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
```

**Save the API URL** — Raymond needs it for the frontend in Wave 4.
Format: `https://XXXXXXXX.execute-api.ap-southeast-1.amazonaws.com/prod`

---

### Verify Each Endpoint

```bash
API_URL="https://XXXXXXXX.execute-api.ap-southeast-1.amazonaws.com/prod"

# Test POST /register
curl -X POST "$API_URL/register" \
  -H "Content-Type: application/json" \
  -d '{"studentId":"test001","name":"Test User","email":"test@gmail.com","photoBase64":"[base64]"}'

# Test GET /records
curl "$API_URL/records?studentId=test001&from=2026-01-01&to=2026-12-31"
```

**When Wave 3 is complete:** All 3 endpoints return correct responses via curl. CORS headers present. API URL noted. Move to Wave 4.
