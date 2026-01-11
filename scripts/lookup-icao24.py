#!/usr/bin/env python3
"""
Lookup ICAO24 (Mode S) codes from the FAA registry for a list of tail numbers.

Usage:
  python3 scripts/lookup-icao24.py N172WF N519ER N73753 N5232K

This script scrapes the FAA N-Number inquiry pages and prints a JSON map
suitable for pasting into the Cloudflare worker's TAIL_TO_ICAO24 constant.
"""

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request

FAA_LOOKUP_URL = 'https://registry.faa.gov/aircraftinquiry/Search/NNumberInquiry?NNumbertxt='
MODE_S_PATTERN = re.compile(r'Mode\s*S\s*Code</td>\s*<td[^>]*>([0-9A-F]{6})', re.IGNORECASE)


def fetch_mode_s_code(tail_number: str) -> str | None:
    url = f"{FAA_LOOKUP_URL}{urllib.parse.quote(tail_number)}"
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request) as response:
        html = response.read().decode('utf-8', errors='ignore')

    match = MODE_S_PATTERN.search(html)
    if match:
        return match.group(1).upper()
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description='Lookup ICAO24 codes for tail numbers.')
    parser.add_argument('tail_numbers', nargs='+', help='Tail numbers (e.g. N172WF)')
    args = parser.parse_args()

    results = {}
    for tail in args.tail_numbers:
        normalized = tail.strip().upper()
        if not normalized:
            continue
        try:
            mode_s = fetch_mode_s_code(normalized)
        except Exception as exc:
            print(f"Error fetching {normalized}: {exc}", file=sys.stderr)
            results[normalized] = None
            continue

        results[normalized] = mode_s

    print(json.dumps(results, indent=2, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
