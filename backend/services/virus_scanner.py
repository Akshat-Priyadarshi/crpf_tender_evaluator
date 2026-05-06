"""
services/virus_scanner.py

Responsibility: One job only — tell us if the file bytes are safe.
Uses pyclamd over TCP (ClamAV container on port 3310).

Design decisions:
- Reads file entirely into memory before scanning. Never touches disk pre-scan.
- Retries connection up to 3 times with backoff — ClamAV startup is slow.
- Returns a typed result object, never raises silently.
- Scan errors are treated as INFECTED (paranoia over speed).
"""

import os
import time
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import pyclamd

logger = logging.getLogger(__name__)

CLAMAV_HOST = os.getenv("CLAMAV_HOST", "clamav")
CLAMAV_PORT = int(os.getenv("CLAMAV_PORT", "3310"))
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds


class ScanVerdict(str, Enum):
    CLEAN    = "clean"
    INFECTED = "infected"
    ERROR    = "error"       # treat as infected — never pass an uncertain file


@dataclass
class ScanResult:
    verdict:      ScanVerdict
    threat_name:  Optional[str] = None   # populated if INFECTED
    engine:       str = "ClamAV"
    error_detail: Optional[str] = None   # populated if ERROR


def _get_clamd_client() -> pyclamd.ClamdNetworkSocket:
    """
    Returns a connected ClamdNetworkSocket.
    Retries with backoff — ClamAV takes time to load virus definitions on first boot.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            client = pyclamd.ClamdNetworkSocket(host=CLAMAV_HOST, port=CLAMAV_PORT)
            client.ping()
            return client
        except Exception as exc:
            logger.warning(
                f"ClamAV connection attempt {attempt}/{MAX_RETRIES} failed: {exc}"
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    raise ConnectionError(
        f"ClamAV unreachable at {CLAMAV_HOST}:{CLAMAV_PORT} after {MAX_RETRIES} attempts. "
        "Ensure the clamav container is running and virus definitions are loaded."
    )


def scan_bytes(file_bytes: bytes, filename: str = "unknown") -> ScanResult:
    """
    Scans raw file bytes for viruses.
    pyclamd returns None if clean, or a dict if infected.
    ERROR verdict is treated as INFECTED — paranoia over speed.
    """
    try:
        client = _get_clamd_client()
    except ConnectionError as exc:
        logger.error(f"[SCAN ERROR] Could not connect to ClamAV: {exc}")
        return ScanResult(verdict=ScanVerdict.ERROR, error_detail=str(exc))

    try:
        # scan_stream() sends bytes to daemon over TCP
        # Returns None if clean, {'stream': ('FOUND', 'ThreatName')} if infected
        result = client.scan_stream(file_bytes)

        if result is None:
            logger.info(f"[SCAN CLEAN] {filename} ({len(file_bytes)} bytes)")
            return ScanResult(verdict=ScanVerdict.CLEAN)

        status, threat = result.get("stream", ("FOUND", "Unknown"))
        logger.warning(f"[SCAN INFECTED] {filename} — threat: {threat}")
        return ScanResult(verdict=ScanVerdict.INFECTED, threat_name=threat)

    except Exception as exc:
        logger.error(f"[SCAN ERROR] Exception during scan of {filename}: {exc}")
        return ScanResult(verdict=ScanVerdict.ERROR, error_detail=str(exc))