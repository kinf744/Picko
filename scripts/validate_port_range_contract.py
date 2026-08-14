#!/usr/bin/env python3
"""Validation structurelle locale du contrat de configuration.

Ce script ne remplace pas le parser Go KIGHMU : il vérifie uniquement que les
chaînes port/range ne sont pas normalisées ou tronquées par les générateurs
Kotlin connus du projet.
"""
from __future__ import annotations

import json
import re

RANGES = ["20000-50000", "6000-19999", "25000"]
PORT_PATTERN = re.compile(r"^(?:[1-9]\d{0,4})(?:-(?:[1-9]\d{0,4}))?$")


def validate_port_text(value: str) -> str:
    value = value.strip().replace(" ", "")
    if not PORT_PATTERN.fullmatch(value):
        raise ValueError(value)
    if "-" in value:
        start, end = map(int, value.split("-", 1))
        if not (0 < start <= 65535 and 0 < end <= 65535 and start <= end):
            raise ValueError(value)
    elif not (0 < int(value) <= 65535):
        raise ValueError(value)
    return value


def libuz_json(host: str, port: str) -> str:
    return json.dumps({
        "server": f"{host}:{port}",
        "obfs": "REDACTED",
        "auth": "REDACTED",
        "socks5": {"listen": "127.0.0.1:7778"},
        "insecure": True,
    }, separators=(",", ":"))


def kighmu_yaml(host: str, port: str) -> str:
    return f"server: '{host}:{port}'\n"


for raw in RANGES:
    port = validate_port_text(raw)
    uz = json.loads(libuz_json("203.0.113.10", port))
    ky = kighmu_yaml("203.0.113.10", port)
    assert uz["server"] == f"203.0.113.10:{raw}"
    assert f"203.0.113.10:{raw}" in ky
    print(f"OK {raw}: libuz={uz['server']} kighmu={ky.strip()}")

print("STRUCTURAL_ONLY: le parser Go KIGHMU exact nécessite ses sources ou un test runtime Android.")
