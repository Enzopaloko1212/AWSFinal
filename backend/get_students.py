import json
import os

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-southeast-1")
STUDENTS_TABLE = os.environ.get("STUDENTS_TABLE", "Students")

students_table = boto3.resource("dynamodb", region_name=REGION).Table(STUDENTS_TABLE)


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
    try:
        result = students_table.scan(
            ProjectionExpression="studentId, #n, email, registeredAt",
            ExpressionAttributeNames={"#n": "name"},
        )
        students = sorted(result.get("Items", []), key=lambda x: x.get("name", ""))
        return _response(200, {"count": len(students), "students": students})
    except ClientError as e:
        return _response(500, {"error": f"DynamoDB scan failed: {e.response['Error']['Message']}"})
