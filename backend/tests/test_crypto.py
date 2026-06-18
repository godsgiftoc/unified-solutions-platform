"""Envelope-encryption tests: round-trip, no plaintext leakage, KEK rotation."""

from __future__ import annotations

from cryptography.fernet import Fernet

from app.core.crypto import SecretBox


def _key() -> str:
    return Fernet.generate_key().decode()


def test_round_trip_and_no_plaintext_leak():
    box = SecretBox([_key()])
    wrapped, ciphertext = box.encrypt_fields({"password": "hunter2", "token": "abcXYZ123"})
    blob = str(ciphertext)
    assert "hunter2" not in blob and "abcXYZ123" not in blob
    assert box.decrypt_fields(wrapped, ciphertext) == {"password": "hunter2", "token": "abcXYZ123"}


def test_kek_rotation_preserves_decryptability():
    old = _key()
    box_old = SecretBox([old])
    wrapped, ciphertext = box_old.encrypt_fields({"password": "s3cret"})

    # New key listed first, old key second → old ciphertext still decrypts.
    new = _key()
    box_new = SecretBox([new, old])
    assert box_new.decrypt_fields(wrapped, ciphertext) == {"password": "s3cret"}

    rewrapped = box_new.rewrap_dek(wrapped)
    assert box_new.decrypt_fields(rewrapped, ciphertext) == {"password": "s3cret"}


def test_missing_master_key_raises():
    import pytest

    with pytest.raises(ValueError):
        SecretBox([])
