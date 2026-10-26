import hashlib
import secrets

from pwdlib import PasswordHash

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    # Argon2id
    return password_hasher.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    # 验证 Argon2id 哈希
    return password_hasher.verify(password, hashed_password)


def generate_session_token() -> str:
    # 生成32字节随机字节token， 入库前再sha-256, 会添加到cookie上
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    # 返回 SHA-256 十六进制摘要
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
