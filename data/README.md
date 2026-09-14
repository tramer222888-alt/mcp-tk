# Indeks IPO

Plik `ipo-index.json` jest generowany przez `npm run index` wyłącznie z
oficjalnej listy Internetowego Portalu Orzeczeń TK. Workflow
`update-index.yml` odświeża go co tydzień i zapisuje czas pobrania w polu
`generated_at`.

Pełne teksty nie są kopiowane do repozytorium — `get_judgment` zawsze pobiera
je na żywo z oficjalnego serwisu TK.
