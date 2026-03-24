from __future__ import annotations

import asyncio
import mimetypes
import os
import shutil
from functools import lru_cache
from pathlib import Path
from typing import Iterable

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from backend.config import get_settings


def _normalize_key(key: str) -> str:
    key = (key or "").strip().replace("\\", "/").lstrip("/")
    return key


def build_key(category: str, filename: str) -> str:
    return _normalize_key(f"{category}/{filename}")


class StorageBackend:
    async def save_bytes(self, key: str, data: bytes, content_type: str | None = None) -> str:
        raise NotImplementedError

    async def save_file(self, key: str, file_path: str, content_type: str | None = None) -> str:
        raise NotImplementedError

    async def get_url(self, key: str) -> str:
        raise NotImplementedError

    async def exists(self, key: str) -> bool:
        raise NotImplementedError

    async def download_to_path(self, key: str, dest_path: str) -> str:
        raise NotImplementedError

    async def delete(self, key: str) -> None:
        raise NotImplementedError

    async def list_keys(self, prefix: str) -> list[str]:
        raise NotImplementedError


class LocalStorage(StorageBackend):
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)

    def _path_for(self, key: str) -> Path:
        return self.base_dir / _normalize_key(key)

    async def save_bytes(self, key: str, data: bytes, content_type: str | None = None) -> str:
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
        return _normalize_key(key)

    async def save_file(self, key: str, file_path: str, content_type: str | None = None) -> str:
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(shutil.copy2, file_path, path)
        return _normalize_key(key)

    async def get_url(self, key: str) -> str:
        return f"/media/{_normalize_key(key)}"

    async def exists(self, key: str) -> bool:
        return self._path_for(key).exists()

    async def download_to_path(self, key: str, dest_path: str) -> str:
        src = self._path_for(key)
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(shutil.copy2, src, dest_path)
        return dest_path

    async def delete(self, key: str) -> None:
        path = self._path_for(key)
        if path.exists():
            await asyncio.to_thread(os.remove, path)

    async def list_keys(self, prefix: str) -> list[str]:
        root = self._path_for(prefix)
        if not root.exists():
            return []
        keys: list[str] = []
        for path in root.rglob("*"):
            if path.is_file():
                rel = path.relative_to(self.base_dir).as_posix()
                keys.append(rel)
        return keys


class S3Storage(StorageBackend):
    def __init__(
        self,
        endpoint_url: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str,
        secure: bool,
        presign_expires: int,
    ):
        self.endpoint_url = endpoint_url
        self.bucket = bucket
        self.presign_expires = presign_expires
        # MinIO and most S3-compatible endpoints require path-style addressing;
        # virtual-hosted style often yields 400 Bad Request on HeadObject/GetObject.
        use_path_style = "amazonaws.com" not in (endpoint_url or "").lower()
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            use_ssl=secure,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path" if use_path_style else "virtual"},
            ),
        )

    def _ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)

    async def _run(self, fn, *args, **kwargs):
        return await asyncio.to_thread(fn, *args, **kwargs)

    async def save_bytes(self, key: str, data: bytes, content_type: str | None = None) -> str:
        key = _normalize_key(key)
        self._ensure_bucket()
        extra = {}
        if content_type:
            extra["ContentType"] = content_type
        await self._run(self.client.put_object, Bucket=self.bucket, Key=key, Body=data, **extra)
        return key

    async def save_file(self, key: str, file_path: str, content_type: str | None = None) -> str:
        key = _normalize_key(key)
        self._ensure_bucket()
        extra = {}
        if content_type:
            extra["ContentType"] = content_type
        if extra:
            await self._run(
                self.client.upload_file,
                file_path,
                self.bucket,
                key,
                ExtraArgs=extra,
            )
        else:
            await self._run(
                self.client.upload_file,
                file_path,
                self.bucket,
                key,
            )
        return key

    async def get_url(self, key: str) -> str:
        key = _normalize_key(key)
        return await self._run(
            self.client.generate_presigned_url,
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=self.presign_expires,
        )

    async def exists(self, key: str) -> bool:
        key = _normalize_key(key)
        if not key:
            return False
        try:
            await self._run(self.client.head_object, Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False

    async def download_to_path(self, key: str, dest_path: str) -> str:
        key = _normalize_key(key)
        if not key:
            raise ValueError("S3 object key is empty")
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        await self._run(self.client.download_file, self.bucket, key, dest_path)
        return dest_path

    async def delete(self, key: str) -> None:
        key = _normalize_key(key)
        await self._run(self.client.delete_object, Bucket=self.bucket, Key=key)

    async def list_keys(self, prefix: str) -> list[str]:
        prefix = _normalize_key(prefix)
        keys: list[str] = []
        continuation: str | None = None
        while True:
            kwargs = {"Bucket": self.bucket, "Prefix": prefix}
            if continuation:
                kwargs["ContinuationToken"] = continuation
            resp = await self._run(self.client.list_objects_v2, **kwargs)
            for obj in resp.get("Contents", []):
                keys.append(obj["Key"])
            if not resp.get("IsTruncated"):
                break
            continuation = resp.get("NextContinuationToken")
        return keys


@lru_cache
def get_storage() -> StorageBackend:
    settings = get_settings()
    if settings.storage_is_s3:
        return S3Storage(
            endpoint_url=settings.s3_endpoint_url,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            bucket=settings.s3_bucket,
            region=settings.s3_region,
            secure=settings.s3_secure,
            presign_expires=settings.s3_presign_expires,
        )
    return LocalStorage(settings.media_dir)


def guess_content_type(filename: str) -> str | None:
    ctype, _ = mimetypes.guess_type(filename)
    return ctype


def local_path_for(key: str) -> str | None:
    settings = get_settings()
    if settings.storage_is_s3:
        return None
    path = Path(key)
    if path.is_absolute():
        return str(path)
    return str(Path(settings.media_dir) / _normalize_key(key))
