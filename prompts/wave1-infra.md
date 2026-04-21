# Wave 1 Prompt — Infrastructure Setup

Use this prompt when starting Wave 1. Paste it into Claude Code or GitHub Copilot Chat.

---

## Prompt

You are helping set up the AWS infrastructure for a Smart Attendance System (Group 1, UA&P Advanced Cloud Computing).

**Project:** Serverless face-recognition attendance system on AWS.
**Region:** ap-southeast-1 (Singapore)
**Rule:** Everything via AWS CLI only — no console clicking.

**My AWS Account ID is:** `[PASTE ACCOUNT_ID HERE]`
**My email (for billing alarm and SES):** `[PASTE EMAIL HERE]`

Run the script at `scripts/setup-infra.sh` to create all infrastructure. Before running, fill in `ACCOUNT_ID` and `LEADER_EMAIL` at the top of that file.

The script will create:
1. S3 bucket `smart-attendance-photos` (public access blocked)
2. Rekognition collection `smart-attendance-faces`
3. DynamoDB table `Students` (PK: studentId)
4. DynamoDB table `AttendanceLogs` (PK: logId, GSI on studentId+timestamp)
5. IAM role `lambda-attendance-role` with permissions for S3, Rekognition, DynamoDB, SES, CloudWatch Logs
6. SES email verification for my email address
7. $1 billing alarm via CloudWatch + SNS

After running, verify with:
```bash
aws s3 ls | grep smart-attendance
aws rekognition list-collections --region ap-southeast-1
aws dynamodb list-tables --region ap-southeast-1
aws iam get-role --role-name lambda-attendance-role
```

Save the Role ARN output — it is needed for Wave 2.
Format: `arn:aws:iam::ACCOUNT_ID:role/lambda-attendance-role`

Also verify all team emails with SES before Wave 2:
```bash
aws ses verify-email-identity --email-address TEAMMATE_EMAIL --region ap-southeast-1
```
Each teammate must click the verification link in their inbox.

**When Wave 1 is complete:** All resources exist, billing alarm is active, and the Role ARN is noted. Move to Wave 2.
