import base64
import hashlib
import hmac
import json
import os
import time

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-southeast-1")
USERS_TABLE = os.environ.get("USERS_TABLE", "Users")
COLLECTION_ID = os.environ.get("COLLECTION_ID", "smart-attendance-faces")
TOKEN_SECRET = os.environ.get("TOKEN_SECRET", "demo-secret-change-me")
MATCH_THRESHOLD = float(os.environ.get("MATCH_THRESHOLD", "90"))
TOKEN_TTL_SECS = 60 * 60 * 8

users_table = boto3.resource("dynamodb", region_name=REGION).Table(USERS_TABLE)
rekognition = boto3.client("rekognition", region_name=REGION)


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


def _verify_password(password, stored_hash, salt_hex):
    salt = bytes.fromhex(salt_hex)
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000).hex()
    return hmac.compare_digest(candidate, stored_hash)


def _make_token(user_id, role):
    payload = json.dumps({"userId": user_id, "role": role, "exp": int(time.time()) + TOKEN_TTL_SECS})
    payload_b64 = base64.urlsafe_b64encode(payload.encode("utf-8")).rstrip(b"=").decode("ascii")
    sig = hmac.new(TOKEN_SECRET.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")
    return f"{payload_b64}.{sig_b64}"


def _user_public(item):
    return {
        "userId": item["userId"],
        "name": item.get("name"),
        "email": item.get("email"),
        "role": item.get("role", "student"),
    }


def handler(event, context):
    try:
        payload = _parse_body(event)
    except (TypeError, ValueError):
        return _response(400, {"error": "Invalid JSON body"})

    photo_b64 = payload.get("photoBase64")
    if photo_b64:
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
            return _response(404, {"error": "No detectable face in image"})
        except ClientError as e:
            return _response(500, {"error": f"Rekognition failed: {e.response['Error']['Message']}"})

        matches = search.get("FaceMatches", [])
        if not matches:
            return _response(401, {"error": "Face not recognized"})

        user_id = matches[0]["Face"]["ExternalImageId"]
        item = users_table.get_item(Key={"userId": user_id}).get("Item")
        if not item:
            return _response(404, {"error": f"Face matched but user {user_id} not found"})

        return _response(200, {"token": _make_token(user_id, item.get("role", "student")), "user": _user_public(item)})

    user_id = payload.get("userId")
    password = payload.get("password")
    if not user_id or not password:
        return _response(400, {"error": "Provide either photoBase64, OR userId + password"})

    item = users_table.get_item(Key={"userId": user_id}).get("Item")
    if not item:
        return _response(401, {"error": "Invalid credentials"})

    if not _verify_password(password, item.get("passwordHash", ""), item.get("passwordSalt", "")):
        return _response(401, {"error": "Invalid credentials"})

    return _response(200, {"token": _make_token(user_id, item.get("role", "student")), "user": _user_public(item)})
