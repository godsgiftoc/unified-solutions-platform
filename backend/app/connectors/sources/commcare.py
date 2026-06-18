"""CommCare HQ — native connector (Form/Case Data API).

Pulls form submissions, paginating via the API's cursor and supporting an
incremental cursor on ``received_on``. Survey schema-on-read: the full form JSON
lands as a record; no per-question typed columns.
"""

from __future__ import annotations

from collections.abc import Iterator

import httpx

from app.connectors.base import (
    Category,
    ConnectorDefinition,
    ConnectorField,
    FieldType,
    Kind,
    Maturity,
)
from app.connectors.extractor import (
    BaseHttpExtractor,
    ConnectionTestResult,
    Record,
    StreamSchema,
    SyncState,
)
from app.connectors.registry import register

STREAM = "form_submissions"


class CommCareExtractor(BaseHttpExtractor):
    def __init__(self, config: dict):
        super().__init__(config)
        self.base_url = config["base_url"].rstrip("/")
        self.app_slug = config["app_slug"]
        self.username = config["username"]
        self.password = config["password"]
        self.form_ids = [f.strip() for f in config.get("form_ids", "").split(",") if f.strip()]
        self.client.auth = httpx.BasicAuth(self.username, self.password)

    def _api(self, path: str) -> str:
        return f"{self.base_url}/a/{self.app_slug}/api/v0.5/{path}"

    def test_connection(self) -> ConnectionTestResult:
        try:
            resp = self._get(self._api("form/"), params={"limit": 1})
            return ConnectionTestResult(ok=True, message="Authenticated with CommCare HQ.",
                                        details={"status": resp.status_code})
        except httpx.HTTPError as exc:
            return ConnectionTestResult(ok=False, message=f"CommCare connection failed: {exc}")

    def discover_schema(self) -> list[StreamSchema]:
        return [
            StreamSchema(
                name=STREAM,
                json_schema={"type": "object"},
                cursor_field="received_on",
                supports_incremental=True,
            )
        ]

    def read(
        self, streams: list[str] | None = None, state: SyncState | None = None
    ) -> Iterator[Record]:
        params: dict = {"limit": 100}
        if self.form_ids:
            params["xmlns"] = self.form_ids[0]
        if state and state.cursors.get(STREAM, {}).get("received_on"):
            params["received_on_start"] = state.cursors[STREAM]["received_on"]

        url: str | None = self._api("form/")
        while url:
            resp = self._get(url, params=params if url.endswith("form/") else None)
            payload = resp.json()
            for obj in payload.get("objects", []):
                yield Record(
                    stream=STREAM,
                    data=obj,
                    primary_key_value=obj.get("id"),
                )
            next_path = payload.get("meta", {}).get("next")
            url = f"{self.base_url}{next_path}" if next_path else None


register(
    ConnectorDefinition(
        type="commcare",
        name="CommCare",
        kind=Kind.NATIVE,
        category=Category.SURVEY,
        maturity=Maturity.BETA,
        icon="home",
        subtitle="Household survey HQ",
        description="Sync form submissions from CommCare HQ.",
        supports_incremental=True,
        supports_schema_discovery=True,
        fields=[
            ConnectorField(name="base_url", label="Base URL", type=FieldType.URL,
                           placeholder="https://www.commcarehq.org"),
            ConnectorField(name="app_slug", label="App / project slug"),
            ConnectorField(name="username", label="Username"),
            ConnectorField(name="password", label="Password / API key",
                           type=FieldType.PASSWORD, secret=True),
            ConnectorField(name="form_ids", label="Form IDs (comma-separated)",
                           required=False, help_text="Leave blank to sync all forms."),
        ],
        extractor_factory=lambda config: CommCareExtractor(config),
    )
)
