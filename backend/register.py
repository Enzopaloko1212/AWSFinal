import base64
import hashlib
import json
import os
import secrets
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-southeast-1")
PHOTO_BUCKET = os.environ["PHOTO_BUCKET"]
COLLECTION_ID = os.environ.get("COLLECTION_ID", "smart-attendance-faces")
USERS_TABLE = os.environ.get("USERS_TABLE", "Users")

s3 = boto3.client("s3", region_name=REGION)
rekognition = boto3.client("rekognition", region_name=REGION)
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


def _parse_body(event):
    body = event.get("body")
    if body is None:
        return event
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    return json.loads(body) if isinstance(body, str) else body


def _hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return digest.hex(), salt.hex()


def handler(event, context):
    try:
        payload = _parse_body(event)
        user_id = payload.get("userId") or payload["studentId"]
        name = payload["name"]
        email = payload["email"]
        password = payload["password"]
        photo_b64 = payload["photoBase64"]
        role = payload.get("role", "student")
    except (KeyError, TypeError, ValueError):
        return _response(400, {"error": "Missing or invalid fields: userId, name, email, password, photoBase64"})

    if role not in ("student", "admin"):
        return _response(400, {"error": "role must be 'student' or 'admin'"})

    existing = users_table.get_item(Key={"userId": user_id})
    if "Item" in existing:
        return _response(409, {"error": f"userId {user_id} already registered"})

    try:
        photo_bytes = base64.b64decode(photo_b64)
    except Exception:
        return _response(400, {"error": "photoBase64 is not valid base64"})

    photo_key = f"photos/{user_id}.jpg"

    try:
        s3.put_object(Bucket=PHOTO_BUCKET, Key=photo_key, Body=photo_bytes, ContentType="image/jpeg")
    except ClientError as e:
        return _response(500, {"error": f"S3 upload failed: {e.response['Error']['Message']}"})

    try:
        index_result = rekognition.index_faces(
            CollectionId=COLLECTION_ID,
            Image={"S3Object": {"Bucket": PHOTO_BUCKET, "Name": photo_key}},
            ExternalImageId=user_id,
            DetectionAttributes=["DEFAULT"],
            MaxFaces=1,
            QualityFilter="AUTO",
        )
    except ClientError as e:
        s3.delete_object(Bucket=PHOTO_BUCKET, Key=photo_key)
        return _response(500, {"error": f"Rekognition failed: {e.response['Error']['Message']}"})

    face_records = index_result.get("FaceRecords", [])
    if not face_records:
        s3.delete_object(Bucket=PHOTO_BUCKET, Key=photo_key)
        return _response(400, {"error": "No face detected in photo"})

    face_id = face_records[0]["Face"]["FaceId"]
    pwd_hash, pwd_salt = _hash_password(password)

    users_table.put_item(
        Item={
            "userId": user_id,
            "name": name,
            "email": email,
            "role": role,
            "passwordHash": pwd_hash,
            "passwordSalt": pwd_salt,
            "faceId": face_id,
            "photoKey": photo_key,
            "registeredAt": datetime.now(timezone.utc).isoformat(),
        }
    )

    return _response(200, {"userId": user_id, "role": role, "faceId": face_id, "message": "Registered"})
