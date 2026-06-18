"""Envelope encryption for connection secrets.

Design (see plan §4.3):
- A master key (KEK) lives only in the environment / a secrets manager.
- Each connection gets its own data key (DEK). The DEK encrypts the secret
  fields; the DEK itself is wrapped (encrypted) by the KEK and stored alongside
  the ciphertext. Rotating the KEK only re-wraps DEKs, not every secret.
- Plaintext is only ever handled inside the worker at sync/test time and is
  never logged or returned by the API.

`MultiFernet` enables zero-downtime KEK rotation: list new key first, old keys
after; decryption tries each, encryption uses the first.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, MultiFernet

from app.core.config import settings

# Sentinel returned by the API in place of a stored secret. On update, a field
# equal to this means "leave the existing value unchanged".
SECRET_SENTINEL = "********"


class SecretBox:
    """Wraps/unwraps per-connection data keys and encrypts secret fields."""

    def __init__(self, kek_keys: list[str]):
        if not kek_keys or not kek_keys[0]:
            raise ValueError(
                "USP_MASTER_KEY is not set. Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; "
                'print(Fernet.generate_key().decode())"'
            )
        self._kek = MultiFernet([Fernet(k.encode()) for k in kek_keys])

    def new_dek(self) -> tuple[bytes, bytes]:
        """Return (plaintext_dek, wrapped_dek). Store only the wrapped one."""
        dek = Fernet.generate_key()
        return dek, self._kek.encrypt(dek)

    def _unwrap(self, wrapped_dek: bytes) -> Fernet:
        return Fernet(self._kek.decrypt(wrapped_dek))

    def encrypt_field(self, dek: bytes, plaintext: str) -> str:
        return Fernet(dek).encrypt(plaintext.encode()).decode()

    def decrypt_field(self, wrapped_dek: bytes, ciphertext: str) -> str:
        return self._unwrap(wrapped_dek).decrypt(ciphertext.encode()).decode()

    def encrypt_fields(self, plaintext_fields: dict[str, str]) -> tuple[bytes, dict[str, str]]:
        """Encrypt a dict of secret fields under a fresh DEK.

        Returns (wrapped_dek, {field: ciphertext}).
        """
        dek, wrapped = self.new_dek()
        return wrapped, {k: self.encrypt_field(dek, v) for k, v in plaintext_fields.items()}

    def decrypt_fields(self, wrapped_dek: bytes, ciphertext_fields: dict[str, str]) -> dict[str, str]:
        f = self._unwrap(wrapped_dek)
        return {k: f.decrypt(v.encode()).decode() for k, v in ciphertext_fields.items()}

    def rewrap_dek(self, wrapped_dek: bytes) -> bytes:
        """Re-wrap a DEK under the current primary KEK (for key rotation)."""
        return self._kek.rotate(wrapped_dek)


def _load_kek_keys() -> list[str]:
    # Comma-separated allows rotation: "newkey,oldkey".
    return [k.strip() for k in settings.master_key.split(",") if k.strip()]


# Module-level singleton; constructed lazily so importing this module doesn't
# explode in environments where the key isn't configured yet (e.g. migrations).
_secret_box: SecretBox | None = None


def get_secret_box() -> SecretBox:
    global _secret_box
    if _secret_box is None:
        _secret_box = SecretBox(_load_kek_keys())
    return _secret_box
