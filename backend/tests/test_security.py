import hashlib
import re

from app.core.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


def test_password_hash_uses_argon2id_and_random_salt():
    password = "a-long-test-password"

    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash.startswith("$argon2id$")
    assert second_hash.startswith("$argon2id$")
    assert first_hash != second_hash


def test_verify_password_accepts_only_the_original_password():
    password = "a-long-test-password"
    password_hash = hash_password(password)

    assert verify_password(password, password_hash) is True
    assert verify_password("incorrect-password", password_hash) is False


def test_generate_session_token_returns_unique_url_safe_values():
    tokens = {generate_session_token() for _ in range(16)}

    assert len(tokens) == 16
    assert all(re.fullmatch(r"[A-Za-z0-9_-]{43}", token) for token in tokens)


def test_hash_session_token_returns_a_stable_sha256_hex_digest():
    token = "example-session-token"
    expected = hashlib.sha256(token.encode("utf-8")).hexdigest()

    assert hash_session_token(token) == expected
    assert re.fullmatch(r"[0-9a-f]{64}", expected)


def test_hash_session_token_changes_for_different_tokens():
    first_token = "example-session-token"
    second_token = "another-session-token"

    assert hash_session_token(first_token) != hash_session_token(second_token)
