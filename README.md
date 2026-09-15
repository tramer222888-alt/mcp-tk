# mcp-tk

Serwer MCP dla polskiego **orzecznictwa Trybunału Konstytucyjnego**. Korzysta wyłącznie z oficjalnych serwisów TK:

- [OTK ZU — Orzecznictwo Trybunału Konstytucyjnego, Zbiór Urzędowy](https://otkzu.trybunal.gov.pl/)
- [IPO — Internetowy Portal Orzeczeń](https://ipo.trybunal.gov.pl/ipo/)
- [strona TK o obu bazach](https://trybunal.gov.pl/orzeczenia/)

Nie używa SAOS ani komercyjnych baz, nie wymaga konta i nie wymaga klucza API.

## Po co

`mcp-tk` daje modelowi rzeczywiste orzeczenia TK: sygnaturę, datę, rodzaj, przedmiot, skład, pełny tekst, bezpośredni link i pozycję OTK ZU. Długie dokumenty można pobierać sekcjami i porcjami, zamiast zużywać cały budżet kontekstu naraz.

## Instalacja jednym poleceniem

### ChatGPT desktop / Codex

W ustawieniach MCP wybierz transport `STDIO` i wpisz:

- polecenie: `npx`
- argument 1: `-y`
- argument 2: `github:tramer222888-alt/mcp-tk`

Albo dodaj serwer z terminala:

```sh
codex mcp add tk -- npx -y github:tramer222888-alt/mcp-tk
```

### Claude Code

```sh
claude mcp add tk -- npx -y github:tramer222888-alt/mcp-tk
```

Wymagane są Node.js 18+ i Git w `PATH`. Gotowe pliki `dist` są
wersjonowane w repozytorium, więc serwer nie kompiluje TypeScriptu podczas
startu.

Na Windows, jeśli `npx` nie uruchamia się bezpośrednio:

```powershell
claude mcp add tk -- cmd /c "npx -y github:tramer222888-alt/mcp-tk"
```

## Narzędzia

| Tool | Działanie |
|---|---|
| `search(query, searchInContent?, where?, inflection?, dateFrom?, dateTo?, kind?, pageSize?, pageNumber?)` | Wyszukiwanie tematyczne. Domyślnie szybki indeks oficjalnych metadanych; `searchInContent=true` przełącza na żywy formularz pełnotekstowy IPO. |
| `search_by_signature(signature, pageSize?, pageNumber?)` | Dokładne wyszukiwanie po sygnaturze, np. `K 23/11`. |
| `list_recent(pageSize?, pageNumber?)` | Najnowsze orzeczenia bezpośrednio z żywej listy IPO. |
| `get_judgment(id, caseId?, section?, offset?, maxChars?)` | Pełny tekst i metadane. `id` może być ID IPO (`25657`) albo pozycją OTK ZU (`2026/A/96`). |

Każda odpowiedź zawiera `structuredContent.citations`. `get_judgment` umieszcza pobrany fragment również w `structuredContent.judgment.content_chunk`, ponieważ część klientów MCP pokazuje modelowi tylko dane strukturalne.

## Dwa tryby wyszukiwania

Domyślny `search` przeszukuje indeks zbudowany wyłącznie z oficjalnej listy IPO:

- sygnaturę,
- rodzaj orzeczenia,
- datę,
- pole „Dotyczy”.

Indeks jest automatycznie odświeżany przez GitHub Actions co tydzień. Każda odpowiedź podaje `index_generated_at`, więc model nie musi zgadywać świeżości danych. Gdy pliku indeksu jeszcze nie ma, serwer potrafi zbudować go na żywo z oficjalnych stron; pierwsze takie wywołanie trwa dłużej.

`searchInContent=true` uruchamia pełnotekstowy formularz JSF oficjalnego IPO. Parametr `where` pozwala ograniczyć wyszukiwanie do:

- `wszedzie`
- `komparycja`
- `sentencja`
- `uzasadnienie`
- `historia`
- `przed_rozprawa`
- `na_rozprawie`
- `ocena_prawna`
- `zdanie_odrebne`

Formularz TK bywa przeciążony i może odpowiadać znacznie wolniej niż pobieranie dokumentów. Błąd `[upstream_error]` oznacza jawną awarię lub timeout źródła, nie „zero wyników”.

## Długie orzeczenia: sekcje i offset

`get_judgment` wykrywa następujące sekcje:

| Sekcja | Zawartość |
|---|---|
| `calosc` | cały dokument |
| `sklad` | skład orzekający |
| `sentencja` | rozstrzygnięcie (`orzeka` / `postanawia`) |
| `uzasadnienie` | całe uzasadnienie |
| `stanowiska_uczestnikow` | część poprzedzająca własną ocenę TK |
| `ocena_trybunalu` | fragment od „Trybunał Konstytucyjny zważył…” |
| `zdania_odrebne` | zdania odrębne |

`maxChars` przyjmuje 500–50 000 znaków (domyślnie 15 000). `offset` jest liczony od początku wybranej sekcji. Odpowiedź zawiera bezwzględny zakres znaków, mapę sekcji, `has_more` i gotowy `next_offset`.

Przykładowy tok pracy:

1. `search({ query: "prawo do sądu" })`
2. `get_judgment({ id: "25567", section: "ocena_trybunalu" })`
3. jeżeli `has_more=true`: ponowne wywołanie z tym samym `section` i podanym `next_offset`

## Pozycje OTK ZU

Można podać bezpośrednio identyfikator publikacji:

```text
get_judgment(id="2026/A/96")
```

Serwer pobiera oficjalną stronę OTK ZU, odczytuje z niej powiązane identyfikatory IPO, a następnie pobiera tekst na żywo. W odpowiedzi zachowuje oddzielnie:

- `url` — strona dokumentu IPO,
- `otkzu_url` — pozycja Zbioru Urzędowego,
- `otkzu_pdf_url` — urzędowy PDF, gdy jest dostępny.

Obsługiwany jest nowy format `RRRR/A/POZ` oraz starszy `RRRR/NR-A/POZ`.

## Cytowania

`structuredContent.citations[]` zawiera:

```json
{
  "title": "Wyrok K 7/18 z 2026-06-24",
  "url": "https://...",
  "signature": "K 7/18",
  "date": "2026-06-24",
  "author": "Trybunał Konstytucyjny",
  "snippet": "...",
  "doc_id": "25567",
  "case_id": "20793"
}
```

Dla pobranego orzeczenia preferowanym URL cytowania jest bezpośrednia pozycja OTK ZU, jeżeli metadane pozwalają ją jednoznacznie wyznaczyć; w pozostałych przypadkach używany jest oficjalny dokument IPO.

## Bezpiecznik na dryf portali

Oba serwisy są publiczne, ale ich kontrakt techniczny nie jest dokumentowany. Konektor sprawdza między innymi:

- obecność formularza `wyszukiwanie`, JSF `ViewState` i znanych pól,
- strukturę listy oraz pagera,
- identyfikatory `dokument` i `sprawa`,
- kontener pełnego tekstu `tekst_{id}`,
- odsyłacz OTK ZU → IPO.

Zniknięcie krytycznego elementu daje `[api_changed]` z linkiem do issues. Awaria sieci lub HTTP daje `[upstream_error]`. Brak dokumentu lub sekcji daje `[not_found]`. Konektor nie zamienia błędu portalu w pozornie poprawny pusty wynik.

## Transport i bezpieczeństwo

- Node.js 18+, TypeScript, `@modelcontextprotocol/sdk`, stdio.
- Natywny `node:http2`: host IPO przy połączeniu HTTP/1.1 potrafi przyjąć połączenie i nie wysłać odpowiedzi.
- Bez wyłączania weryfikacji TLS.
- Stała allowlista dwóch hostów TK i ścieżek portali; argument użytkownika nie staje się dowolnym URL.
- Limit długości zapytań i rozmiaru fragmentów.
- Około 2–3 żądania na sekundę, retry tylko dla błędów przejściowych.
- Brak telemetrii i danych uwierzytelniających.

## Zakres danych

Szybki indeks metadanych odzwierciedla listę dostępną w IPO (elektroniczny korpus portalu, w praktyce od końca lat 90.). Sam OTK ZU ma szerszy katalog historyczny; znaną starszą pozycję można pobrać przez jej identyfikator. Brak wyniku indeksowego nie dowodzi, że bardzo stare orzeczenie nie istnieje.

## Build, testy i indeks

```sh
npm install
npm run build
npm run test:parse   # testy offline parserów, sekcji, offsetów i drift guardów
npm run smoke        # test LIVE: lista + pełny tekst z oficjalnego IPO
npm run index        # przebudowa data/ipo-index.json z oficjalnej listy
node dist/index.js   # serwer MCP na stdio
```

Testy offline używają małych fixture'ów odtwarzających rzeczywistą strukturę HTML portali. Live smoke jest uruchamiany ręcznie, aby zwykłe CI nie zależało od chwilowej dostępności TK.

## Konfiguracja ręczna

```json
{
  "mcpServers": {
    "tk": {
      "command": "node",
      "args": ["/ścieżka/do/mcp-tk/dist/index.js"]
    }
  }
}
```

## Uwaga prawna

Konektor udostępnia źródła, nie udziela porady prawnej. Przy powoływaniu orzeczenia sprawdź jego pełną treść, datę, sentencję, późniejsze orzecznictwo oraz skutki wynikające z art. 190 Konstytucji. Wynik wyszukiwania tematycznego jest kandydatem do analizy, a nie automatycznie „linią orzeczniczą”.

## Podziękowania

Układ MCP, `structuredContent.citations`, porcjowanie i jawna obsługa dryfu są rozwinięciem wzorca z [`HelpToSave/mcp-eureka`](https://github.com/HelpToSave/mcp-eureka), który z kolei wskazuje konektory `mcp-nsa` Wiesława Mazura. Rozpoznanie stabilnych elementów publicznego HTML IPO porównano także z otwartym projektem [`worldwidelaw/legal-sources`](https://github.com/worldwidelaw/legal-sources); implementacja w tym repozytorium jest niezależna.

## Licencja

MIT © 2026 Mateusz Bednarski. Zobacz [LICENSE](LICENSE).
