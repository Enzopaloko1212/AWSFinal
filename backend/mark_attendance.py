import base64
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-southeast-1")
USERS_TABLE = os.environ.get("USERS_TABLE", "Users")
LOGS_TABLE = os.environ.get("LOGS_TABLE", "AttendanceLogs")
GSI_NAME = os.environ.get("GSI_NAME", "studentId-timestamp-index")
SES_SENDER = os.environ["SES_SENDER"]

ses = boto3.client("ses", region_name=REGION)
ddb = boto3.resource("dynamodb", region_name=REGION)
users_table = ddb.Table(USERS_TABLE)
logs_table = ddb.Table(LOGS_TABLE)

ALLOWED_STATUSES = {"present", "absent", "excused"}


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def _parse_body(event):
    body = event.get("body")
    if body is None:
        return event
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    return json.loads(body) if isinstance(body, str) else body


def _send_email(to_addr, subject, text):
    try:
        ses.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [to_addr]},
            Message={
                "Subject": {"Data": subject},
                "Body": {"Text": {"Data": text}},
            },
        )
        return "sent", None
    except ClientError as e:
        err = f"{e.response['Error']['Code']}: {e.response['Error']['Message']}"
        print(f"SES send failed: {err}")
        return "failed", err


def handler(event, context):
    try:
        payload = _parse_body(event)
        user_id = payload["userId"]
        status = payload["status"]
        date = payload["date"]  # YYYY-MM-DD
    except (KeyError, TypeError, ValueError):
        return _response(400, {"error": "Missing fields: userId, status, date (YYYY-MM-DD)"})

    if status not in ALLOWED_STATUSES:
        return _response(400, {"error": f"status must be one of: {sorted(ALLOWED_STATUSES)}"})

    user = users_table.get_item(Key={"userId": user_id}).get("Item")
    if not user:
        return _response(404, {"error": f"User {user_id} not found"})

    from_ts = f"{date}T00:00:00+00:00"
    to_ts = f"{date}T23:59:59+00:00"

    try:
        existing = logs_table.query(
            IndexName=GSI_NAME,
            KeyConditionExpression=Key("studentId").eq(user_id) & Key("timestamp").between(from_ts, to_ts),
        ).get("Items", [])
    except ClientError as e:
        return _response(500, {"error": f"DynamoDB query failed: {e.response['Error']['Message']}"})

    # Delete prior entries for this user+date so we have a single source of truth
    for old in existing:
        logs_table.delete_item(Key={"logId": old["logId"]})

    email_status = "skipped"
    email_error = None

    if status == "absent":
        # Absent = no log entry. We've already cleared any existing logs.
        email_status, email_error = _send_email(
            user["email"],
            "Attendance update: marked absent",
            f"Hi {user['name']}, you were marked ABSENT for {date} by the admin.",
        )
        return _response(200, {
            "userId": user_id, "status": "absent", "date": date,
            "email": email_status, "emailError": email_error,
        })

    timestamp = datetime.now(timezone.utc).isoformat()
    log_id = str(uuid.uuid4())
    logs_table.put_item(
        Item={
            "logId": log_id,
            "studentId": user_id,
            "name": user["name"],
            "timestamp": timestamp,
            "status": status,
            "markedBy": "admin-manual",
        }
    )

    subj = "Attendance update: marked excused" if status == "excused" else "Attendance confirmed"
    body = (
        f"Hi {user['name']}, you were marked EXCUSED for {date} by the admin."
        if status == "excused" else
        f"Hi {user['name']}, attendance confirmed for {date} (marked by admin)."
    )
    email_status, email_error = _send_email(user["email"], subj, body)

    return _response(200, {
        "userId": user_id, "status": status, "date": date, "logId": log_id,
        "email": email_status, "emailError": email_error,
    })
