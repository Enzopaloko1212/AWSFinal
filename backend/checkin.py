import base64
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-southeast-1")
COLLECTION_ID = os.environ.get("COLLECTION_ID", "smart-attendance-faces")
USERS_TABLE = os.environ.get("USERS_TABLE", "Users")
LOGS_TABLE = os.environ.get("LOGS_TABLE", "AttendanceLogs")
SES_SENDER = os.environ["SES_SENDER"]
MATCH_THRESHOLD = float(os.environ.get("MATCH_THRESHOLD", "90"))

rekognition = boto3.client("rekognition", region_name=REGION)
ses = boto3.client("ses", region_name=REGION)
ddb = boto3.resource("dynamodb", region_name=REGION)
users_table = ddb.Table(USERS_TABLE)
logs_table = ddb.Table(LOGS_TABLE)


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


def handler(event, context):
    try:
        payload = _parse_body(event)
        photo_b64 = payload["photoBase64"]
    except (KeyError, TypeError, ValueError):
        return _response(400, {"error": "Missing or invalid field: photoBase64"})

    try:
        photo_bytes = base64.b64decode(photo_b64)
    except Exception:
        return _response(400, {"error": "photoBase64 is not valid base64"})

    try:
        search = rekognition.search_faces_by_image(
            CollectionId=COLLECTION_ID,
            Image={"Bytes": photo_bytes},
            FaceMatchThreshold=MATCH_THRESHOLD,
            MaxFaces=1,
        )
    except rekognition.exceptions.InvalidParameterException:
        return _response(404, {"matched": False, "error": "No detectable face in image"})
    except ClientError as e:
        return _response(500, {"error": f"Rekognition failed: {e.response['Error']['Message']}"})

    matches = search.get("FaceMatches", [])
    if not matches:
        return _response(404, {"matched": False, "error": "No matching face above threshold"})

    user_id = matches[0]["Face"]["ExternalImageId"]
    confidence = matches[0]["Similarity"]

    user = users_table.get_item(Key={"userId": user_id}).get("Item")
    if not user:
        return _response(404, {"matched": False, "error": f"Face matched ExternalImageId {user_id} but no user record"})

    timestamp = datetime.now(timezone.utc).isoformat()
    log_id = str(uuid.uuid4())

    logs_table.put_item(
        Item={
            "logId": log_id,
            "studentId": user_id,
            "name": user["name"],
            "timestamp": timestamp,
            "status": "present",
            "confidence": str(round(confidence, 2)),
        }
    )

    email_status = "sent"
    email_error = None
    try:
        ses.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [user["email"]]},
            Message={
                "Subject": {"Data": "Attendance confirmed"},
                "Body": {
                    "Text": {
                        "Data": f"Attendance confirmed for {user['name']} at {timestamp}."
                    }
                },
            },
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        email_status = "failed"
        email_error = f"{code}: {msg}"
        print(f"SES send failed: {email_error}")

    return _response(200, {
        "matched": True,
        "studentId": user_id,
        "name": user["name"],
        "timestamp": timestamp,
        "confidence": round(confidence, 2),
        "email": email_status,
        "emailError": email_error,
    })
