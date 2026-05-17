from __future__ import annotations

from uuid import uuid4

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import settings


def _build_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        region_name=settings.s3_region,
        config=Config(s3={"addressing_style": "path"} if settings.s3_force_path_style else None),
    )


def ensure_bucket_exists() -> None:
    client = _build_s3_client()
    bucket = settings.s3_bucket_name
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError:
        client.create_bucket(Bucket=bucket)


def upload_driver_photo(*, filename: str, content_type: str, content: bytes) -> str:
    key = f"drivers/{uuid4().hex}_{filename}"
    client = _build_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=content,
        ContentType=content_type,
    )
    return key


def download_driver_photo(*, object_key: str) -> tuple[bytes, str]:
    client = _build_s3_client()
    response = client.get_object(Bucket=settings.s3_bucket_name, Key=object_key)
    content_type = response.get("ContentType", "application/octet-stream")
    body = response["Body"].read()
    return body, content_type
