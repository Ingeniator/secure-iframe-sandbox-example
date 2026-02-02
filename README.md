# secure_sandbox

Спецификация и инструменты для безопасного выполнения произвольного JavaScript в iframe.

## Структура

```
secure_sandbox/
├── README.md              — этот файл
├── Makefile               — make demo / make build
├── sandbox-spec.md        — спецификация: архитектура изоляции, CSP, Permissions Policy, postMessage, DoS-защита, SAST-анализ
├── demo/                  — визуальные демо для ручного тестирования
│   ├── unsecure.html      — iframe БЕЗ защиты (все атаки проходят)
│   ├── secure.html        — iframe С защитой (sandbox + CSP + defense-in-depth)
│   ├── programmatic.html  — пример использования npm-пакета testSandbox()
│   └── data/
│       └── malicious.html — 20 атакующих сценариев для загрузки в iframe
└── tests/                 — npm-пакет sandbox-security-tests
    ├── README.md          — документация по API
    ├── package.json
    ├── src/               — исходники (TypeScript)
    └── dist/              — собранный пакет (ESM + CJS + .d.ts)
```

## Быстрый старт

### 1. Визуальная демонстрация

```bash
make demo            # запуск на порту 8080
make demo PORT=3000  # или на другом порту
```

Откройте http://localhost:8080 и:

1. **unsecure.html** — загрузите `data/malicious.html`, убедитесь что большинство атак проходят (красный)
2. **secure.html** — загрузите тот же файл, убедитесь что все атаки заблокированы (зелёный)
3. **programmatic.html** — нажмите кнопку, чтобы увидеть `testSandbox(iframe)` в действии (требует `make build`)

### 2. Программное тестирование

```bash
make build
```

В вашем приложении:

```ts
import { testSandbox } from 'sandbox-security-tests';

const iframe = document.querySelector('#my-sandbox');
const results = await testSandbox(iframe);

if (results.failed > 0) {
  console.error('Sandbox misconfigured:', results.tests.filter(t => !t.passed));
}
```

Подробнее — в [tests/README.md](tests/README.md).

## Рекомендуемая конфигурация iframe

```html
<iframe
  sandbox="allow-scripts"
  allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; bluetooth 'none'"
  srcdoc="
    <meta http-equiv='Content-Security-Policy'
          content=\"default-src 'none'; script-src 'unsafe-inline';\">
    <script>
      // defense-in-depth: удаление сетевых API
      delete window.fetch;
      delete window.XMLHttpRequest;
      delete window.WebSocket;
      delete window.EventSource;
    </script>
    <script>
      // пользовательский код
    </script>
  "
></iframe>
```

Слои защиты:

| Слой | Что блокирует |
|---|---|
| `sandbox="allow-scripts"` | DOM родителя, cookies, storage, навигация, popup, модальные окна, формы |
| CSP `default-src 'none'` | Сетевые запросы, внешние скрипты, iframe, изображения |
| Permissions Policy (`allow`) | Камера, микрофон, геолокация, платежи, USB, Bluetooth |
| Defense-in-depth (delete API) | Дополнительная блокировка fetch/XHR/WS на уровне JS |

## Спецификация

Полная спецификация — в [sandbox-spec.md](sandbox-spec.md). Разделы:

1. Обзор проблемы
2. Механизм `<iframe sandbox>`
3. Изоляция origin: `srcdoc` и blob-URL
4. Content Security Policy (CSP)
5. Коммуникация через `postMessage`
6. Защита от DoS (Web Worker + таймаут)
7. Перехват console и ограничение глобальных API
8. Permissions Policy (атрибут `allow`)
9. Итоговая архитектура
10. Итоговый пример
11. Автоматическая проверка изоляции (20 тестов)
12. SAST и sandbox — почему статический анализ не добавляет безопасности
13. Ссылки на спецификации (HTML, CSP, Permissions Policy, Web Workers)
