# S&P 500 Index Scraping

## Source

Wikipedia maintains a reliable, frequently-updated list of S&P 500 companies:
`https://en.wikipedia.org/wiki/List_of_S%26P_500_companies`

The first table on the page contains: Symbol, Security (company name), GICS Sector, GICS Sub-Industry, Headquarters, Date Added, CIK, Founded.

## Scraping Method

Use `pandas.read_html()` to parse the Wikipedia table. It returns a list of DataFrames; the first one is the S&P 500 table.

## Index Format

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "sector": "Information Technology",
    "sub_industry": "Technology Hardware, Storage & Peripherals"
  }
]
```

## Search Algorithm

For the `/search` endpoint, use case-insensitive substring matching across symbol, name, and sector fields. Score results by:
1. Exact ticker match (highest priority)
2. Ticker starts-with match
3. Company name contains query
4. Sector contains query

Return top 10 results sorted by score.
