"""Connector definition schema (see plan §4.1).

A connector is declared in code as a ``ConnectorDefinition``. The frontend
renders its config form purely from ``fields``, so adding a connector requires
no frontend changes. ``secret=True`` fields are encrypted at rest and never
returned by the API.
"""

from __future__ import annotations

import enum
from collections.abc import Callable

from pydantic import BaseModel, Field


class FieldType(str, enum.Enum):
    STRING = "string"
    PASSWORD = "password"
    TEXTAREA = "textarea"
    NUMBER = "number"
    BOOLEAN = "boolean"
    SELECT = "select"
    MULTISELECT = "multiselect"
    FILE = "file"
    JSON = "json"
    URL = "url"


class Kind(str, enum.Enum):
    NATIVE = "native"   # has a working extractor → sync supported
    CONFIG = "config"   # persists settings only → "coming soon"


class Maturity(str, enum.Enum):
    GA = "ga"
    BETA = "beta"


class Category(str, enum.Enum):
    SURVEY = "Survey"
    HMIS = "HMIS"
    SPREADSHEET = "Spreadsheet"
    WAREHOUSE = "Warehouse"
    GENERIC = "Generic"
    FILE = "File"


class ConnectorField(BaseModel):
    name: str
    label: str
    type: FieldType = FieldType.STRING
    secret: bool = False
    required: bool = True
    help_text: str | None = None
    placeholder: str | None = None
    options: list[str] | None = None              # SELECT / MULTISELECT
    depends_on: dict[str, str] | None = None       # conditional display: {field: value}


class ConnectorDefinition(BaseModel):
    type: str                       # stable key, e.g. "dhis2"
    name: str                       # display name
    kind: Kind
    category: Category
    maturity: Maturity = Maturity.BETA
    icon: str                       # icon key the frontend maps to an asset
    subtitle: str                   # short gallery-card line, e.g. "National HMIS"
    description: str = ""
    fields: list[ConnectorField] = Field(default_factory=list)
    supports_incremental: bool = False
    supports_schema_discovery: bool = False
    # Factory building a concrete Extractor from a decrypted config dict.
    # None ⇒ kind must be CONFIG (no sync engine yet).
    extractor_factory: Callable[[dict], object] | None = Field(default=None, exclude=True)

    model_config = {"arbitrary_types_allowed": True}

    @property
    def secret_field_names(self) -> set[str]:
        return {f.name for f in self.fields if f.secret}
