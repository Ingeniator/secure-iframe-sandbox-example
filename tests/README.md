# sandbox-security-tests

npm-пакет для **программной** проверки изоляции iframe-песочницы. Предназначен для интеграции в ваше приложение или CI-пайплайн.

## Зачем нужен этот пакет

`demo/data/malicious.html` — ручная визуальная проверка. Вы открываете страницу и смотрите результат глазами.

Этот пакет решает другую задачу: **автоматическое тестирование конфигурации sandbox из JavaScript-кода**. Вы передаёте ему ваш iframe — он прогоняет 20 атакующих сценариев и возвращает структурированный результат.

Типичные сценарии:

- **CI/CD**: запуск через Playwright/Puppeteer, проверка что после изменений в коде sandbox не сломался
- **Runtime-проверка**: вызов `testSandbox()` при старте приложения для валидации конфигурации
- **Мониторинг**: периодическая проверка в production (smoke test)

## Установка

```bash
npm install sandbox-security-tests
```

Или локально из корня проекта:

```bash
make build
```

## API

```ts
import { testSandbox } from 'sandbox-security-tests';

// Передайте iframe, который хотите проверить
const iframe = document.querySelector('#my-sandbox');
const results = await testSandbox(iframe);

console.log(results);
// {
//   passed: 20,
//   failed: 0,
//   tests: [
//     { index: 0, name: 'Чтение DOM родителя', passed: true, detail: '...' },
//     ...
//   ]
// }
```

### `testSandbox(iframe, options?)`

| Параметр | Тип | Описание |
|---|---|---|
| `iframe` | `HTMLIFrameElement` | iframe, конфигурацию которого нужно проверить |
| `options.timeout` | `number` | Таймаут на один тест в мс (по умолчанию 8000) |

Функция:
1. Читает атрибуты `sandbox`, `allow`, `srcdoc` с переданного iframe
2. Для каждого из 20 тестов создаёт **временный** iframe с теми же атрибутами, но с инжектированным тестовым кодом
3. Слушает `postMessage` с результатом, таймаут — 8 сек (настраивается)
4. Возвращает `Promise<TestSuiteResult>`

### Экспорты

```ts
import { testSandbox, tests } from 'sandbox-security-tests';
import type { TestResult, TestSuiteResult, TestDefinition } from 'sandbox-security-tests';
```

- `testSandbox` — основная функция
- `tests` — массив из 20 определений тестов (можно использовать для кастомного раннера)

## 20 тестовых сценариев

| # | Категория | Вектор атаки | Слой защиты |
|---|---|---|---|
| 1 | XSS | `window.parent.document` | sandbox (opaque origin) |
| 2 | Кража данных | `document.cookie` | sandbox (opaque origin) |
| 3 | Кража данных | `localStorage` | sandbox (opaque origin) |
| 4 | Кража данных | `sessionStorage` | sandbox (opaque origin) |
| 5 | Перенаправление | `top.location` | sandbox (opaque origin) |
| 6 | Фишинг | `window.open()` | sandbox (без allow-popups) |
| 7 | Фишинг | `alert()` | sandbox (без allow-modals) |
| 8 | Сетевая атака | `fetch()` | defense-in-depth + CSP |
| 9 | Сетевая атака | `XMLHttpRequest` | defense-in-depth + CSP |
| 10 | Сетевая атака | `WebSocket` | defense-in-depth + CSP |
| 11 | Инъекция | `<script src="...">` | CSP script-src |
| 12 | Инъекция | вложенный `<iframe>` | CSP default-src |
| 13 | Сетевая атака | `navigator.sendBeacon` | defense-in-depth + CSP |
| 14 | Доступ к устройствам | `getUserMedia` (камера) | Permissions Policy |
| 15 | Доступ к устройствам | `geolocation` | Permissions Policy |
| 16 | Обход защиты | восстановление `fetch` через прототип | CSP (основной слой) |
| 17 | DoS | бесконечный цикл в Worker | Worker + terminate() |
| 18 | DoS | выделение памяти в Worker | Worker + terminate() |
| 19 | Эксфильтрация | `form.submit()` | sandbox (без allow-forms) |
| 20 | Побег из sandbox | `frameElement` | sandbox (opaque origin) |

## Живой пример

Откройте `demo/programmatic.html` через `make demo` — страница импортирует собранный пакет и вызывает `testSandbox()` на настроенном iframe. Результаты отображаются в таблице и как raw JSON.

## Пример: Playwright CI-тест

```js
const { test, expect } = require('@playwright/test');

test('sandbox блокирует все векторы атак', async ({ page }) => {
  await page.goto('http://localhost:3000');

  const results = await page.evaluate(async () => {
    const { testSandbox } = await import('./node_modules/sandbox-security-tests/dist/index.mjs');
    const iframe = document.querySelector('#my-sandbox');
    return testSandbox(iframe);
  });

  expect(results.failed).toBe(0);
});
```

## Сборка

```bash
npm run build
```

Результат в `dist/`:
- `index.mjs` — ESM
- `index.cjs` — CommonJS
- `index.d.ts` — TypeScript-типы
