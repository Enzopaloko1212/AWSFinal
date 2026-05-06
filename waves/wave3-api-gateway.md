# Wave 3 Prompt — API Layer (API Gateway)

Use this prompt when starting Wave 3. Wave 2 must be complete first.
Paste into Claude Code or GitHub Copilot Chat.

---

## Context

You are wiring up the API Layer for a Smart Attendance System (Group 1, UA&P Advanced Cloud Computing).

**Account ID:** `782028084000`
**Region:** `ap-southeast-1`
**API Name:** `SmartAttendanceAPI`

**Lambda functions already deployed (Wave 2):**
- `RegisterStudent` → POST /register
- `CheckinStudent` → POST /checkin
- `GetAttendanceRecords` → GET /records

## Architecture layer this wave creates

- **API Layer** — API Gateway REST API that sits between the Frontend Layer and Compute Layer.
  The frontend (Wave 4) sends HTTP requests here; API Gateway routes them to the correct Lambda function.
  CORS must be enabled so browsers don't block cross-origin requests.

---

## Deploy Commands

```bash
REGION="ap-southeast-1"
ACCOUNT_ID="782028084000"

# ── 1. Create REST API ────────────────────────────────────────────────────────
API_ID=$(aws apigateway create-rest-api \
  --name SmartAttendanceAPI \
  --region $REGION \
  --query id --output text)
echo "API_ID=$API_ID"

# ── 2. Get root resource ID ───────────────────────────────────────────────────
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID --region $REGION \
  --query 'items[?path==`/`].id' --output text)

# ═══════════════════════════════════════════════════════
# ROUTE A — POST /register → RegisterStudent
# ═══════════════════════════════════════════════════════

REGISTER_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID --parent-id $ROOT_ID \
  --path-part register --region $REGION \
  --query id --output text)

aws apigateway put-method \
  --rest-api-id $API_ID --resource-id $REGISTER_ID \
  --http-method POST --authorization-type NONE --region $REGION

aws apigateway put-integration \
  --rest-api-id $API_ID --resource-id $REGISTER_ID \
  --http-method POST --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:RegisterStudent/invocations" \
  --region $REGION

aws lambda add-permission \
  --function-name RegisterStudent \
  --statement-id apigateway-register \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/POST/register" \
  --region $REGION

# CORS for /register
aws apigateway put-method \
  --rest-api-id $API_ID --resource-id $REGISTER_ID \
  --http-method OPTIONS --authorization-type NONE --region $REGION

aws apigateway put-integration \
  --rest-api-id $API_ID --resource-id $REGISTER_ID \
  --http-method OPTIONS --type MOCK \
  --request-templates '{"application/json":"{\"statusCode\":200}"}' --region $REGION

aws apigateway put-method-response \
  --rest-api-id $API_ID --resource-id $REGISTER_ID \
  --http-method OPTIONS --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Origin":false}' \
  --region $REGION

aws apigateway put-integration-response \
  --rest-api-id $API_ID --resource-id $REGISTER_ID \
  --http-method OPTIONS --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'POST,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
  --region $REGION

# ═══════════════════════════════════════════════════════
# ROUTE B — POST /checkin → CheckinStudent
# ═══════════════════════════════════════════════════════

CHECKIN_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID --parent-id $ROOT_ID \
  --path-part checkin --region $REGION \
  --query id --output text)

aws apigateway put-method \
  --rest-api-id $API_ID --resource-id $CHECKIN_ID \
  --http-method POST --authorization-type NONE --region $REGION

aws apigateway put-integration \
  --rest-api-id $API_ID --resource-id $CHECKIN_ID \
  --http-method POST --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:CheckinStudent/invocations" \
  --region $REGION

aws lambda add-permission \
  --function-name CheckinStudent \
  --statement-id apigateway-checkin \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/POST/checkin" \
  --region $REGION

# CORS for /checkin (same pattern as /register, method OPTIONS)
aws apigateway put-method \
  --rest-api-id $API_ID --resource-id $CHECKIN_ID \
  --http-method OPTIONS --authorization-type NONE --region $REGION

aws apigateway put-integration \
  --rest-api-id $API_ID --resource-id $CHECKIN_ID \
  --http-method OPTIONS --type MOCK \
  --request-templates '{"application/json":"{\"statusCode\":200}"}' --region $REGION

aws apigateway put-method-response \
  --rest-api-id $API_ID --resource-id $CHECKIN_ID \
  --http-method OPTIONS --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Origin":false}' \
  --region $REGION

aws apigateway put-integration-response \
  --rest-api-id $API_ID --resource-id $CHECKIN_ID \
  --http-method OPTIONS --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'POST,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
  --region $REGION

# ═══════════════════════════════════════════════════════
# ROUTE C — GET /records → GetAttendanceRecords
# ═══════════════════════════════════════════════════════

RECORDS_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID --parent-id $ROOT_ID \
  --path-part records --region $REGION \
  --query id --output text)

aws apigateway put-method \
  --rest-api-id $API_ID --resource-id $RECORDS_ID \
  --http-method GET --authorization-type NONE --region $REGION

aws apigateway put-integration \
  --rest-api-id $API_ID --resource-id $RECORDS_ID \
  --http-method GET --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:GetAttendanceRecords/invocations" \
  --region $REGION

aws lambda add-permission \
  --function-name GetAttendanceRecords \
  --statement-id apigateway-records \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/GET/records" \
  --region $REGION

# CORS for /records
aws apigateway put-method \
  --rest-api-id $API_ID --resource-id $RECORDS_ID \
  --http-method OPTIONS --authorization-type NONE --region $REGION

aws apigateway put-integration \
  --rest-api-id $API_ID --resource-id $RECORDS_ID \
  --http-method OPTIONS --type MOCK \
  --request-templates '{"application/json":"{\"statusCode\":200}"}' --region $REGION

aws apigateway put-method-response \
  --rest-api-id $API_ID --resource-id $RECORDS_ID \
  --http-method OPTIONS --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Origin":false}' \
  --region $REGION

aws apigateway put-integration-response \
  --rest-api-id $API_ID --resource-id $RECORDS_ID \
  --http-method OPTIONS --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
  --region $REGION

# ── 3. Deploy to prod stage ───────────────────────────────────────────────────
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

echo "API URL: https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
```

---

## Verify

```bash
API_URL="https://${API_ID}.execute-api.ap-southeast-1.amazonaws.com/prod"

# Test GET /records (expects 404 — no records yet)
curl -s "$API_URL/records?studentId=test001&from=2026-01-01&to=2026-12-31" | python3 -m json.tool

# Test POST /register missing fields (expects 400)
curl -s -X POST "$API_URL/register" \
  -H "Content-Type: application/json" \
  -d '{"studentId":"test001"}' | python3 -m json.tool

# Check CORS headers present
curl -s -I -X OPTIONS "$API_URL/register" \
  -H "Origin: http://localhost" \
  -H "Access-Control-Request-Method: POST"
```

---

## Output needed for Wave 4

```
API_URL = https://<API_ID>.execute-api.ap-southeast-1.amazonaws.com/prod
```

Save this — Raymond needs it to configure the frontend's fetch calls.

**Wave 3 is complete when:** All 3 endpoints respond via curl, CORS headers present on OPTIONS. Move to Wave 4.
