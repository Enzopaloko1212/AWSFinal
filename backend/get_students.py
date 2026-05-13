import json
import os

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-southeast-1")
USERS_TABLE = os.environ.get("USERS_TABLE", "Users")

users_table = boto3.resource("dynamodb", region_name=REGION).Table(USERS_TABLE)


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
        # Roster = students only
        result = users_table.scan(
            FilterExpression=Attr("role").eq("student") | Attr("role").not_exists(),
            ProjectionExpression="userId, #n, email, registeredAt",
            ExpressionAttributeNames={"#n": "name"},
        )
        items = sorted(result.get("Items", []), key=lambda x: x.get("name", ""))
        # Frontend still expects studentId field — alias it for compat
        students = [{"studentId": i["userId"], **{k: v for k, v in i.items() if k != "userId"}} for i in items]
        return _response(200, {"count": len(students), "students": students})
    except ClientError as e:
        return _response(500, {"error": f"DynamoDB scan failed: {e.response['Error']['Message']}"})
