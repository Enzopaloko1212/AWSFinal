import json
import os

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-southeast-1")
LOGS_TABLE = os.environ.get("LOGS_TABLE", "AttendanceLogs")
GSI_NAME = os.environ.get("GSI_NAME", "studentId-timestamp-index")

logs_table = boto3.resource("dynamodb", region_name=REGION).Table(LOGS_TABLE)


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    student_id = params.get("studentId")
    date_from = params.get("from")
    date_to = params.get("to")

    if not date_from or not date_to:
        return _response(400, {"error": "Required query params: from (YYYY-MM-DD), to (YYYY-MM-DD). studentId is optional."})

    from_ts = f"{date_from}T00:00:00+00:00"
    to_ts = f"{date_to}T23:59:59+00:00"

    try:
        if student_id:
            # Query by specific student using GSI
            result = logs_table.query(
                IndexName=GSI_NAME,
                KeyConditionExpression=Key("studentId").eq(student_id) & Key("timestamp").between(from_ts, to_ts),
                ScanIndexForward=True,
            )
            items = result.get("Items", [])
        else:
            # Scan all logs for the date range (used by attendance tab)
            result = logs_table.scan(
                FilterExpression=Key("timestamp").between(from_ts, to_ts),
            )
            items = sorted(result.get("Items", []), key=lambda x: x.get("timestamp", ""))
    except ClientError as e:
        return _response(500, {"error": f"DynamoDB query failed: {e.response['Error']['Message']}"})

    if not items:
        return _response(404, {"studentId": student_id, "records": [], "message": "No attendance records in range"})

    return _response(200, {"studentId": student_id, "count": len(items), "records": items})
