# Спецификация: безопасное выполнение JavaScript в iframe

## 1. Обзор проблемы

Выполнение произвольного пользовательского JavaScript-кода на странице без изоляции открывает следующие векторы атак:

- **XSS** — доступ к cookies, localStorage, sessionStorage родительского документа
- **Кража данных** — чтение DOM родительской страницы через `window.parent`
- **Перенаправление** — изменение `top.location`
- **Криптомайнинг / DoS** — бесконтрольное потребление CPU/памяти
- **Фишинг** — подмена UI родительского окна
- **Сетевые атаки** — произвольные fetch/XHR-запросы от имени пользователя

---

## 2. Механизм изоляции: `<iframe sandbox>`

### 2.1. Базовый принцип

Атрибут `sandbox` на элементе `<iframe>` включает набор ограничений. Без значений применяются **все** ограничения:

```html
<iframe sandbox></iframe>
```

Это запрещает:

| Ограничение | Описание |
|---|---|
| Выполнение скриптов | JS не работает вообще |
| Отправку форм | `<form>` не может быть submit |
| Доступ к parent | `window.parent`, `window.top` недоступны |
| Навигацию top-level | Нельзя менять `top.location` |
| Попапы | `window.open()` заблокирован |
| Модальные диалоги | `alert()`, `confirm()`, `prompt()` заблокированы |
| Pointer lock | Захват курсора запрещён |
| Автовоспроизведение | Медиа не воспроизводится автоматически |

> **Спецификация:** [HTML Living Standard — Sandboxing](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)

### 2.2. Выборочное снятие ограничений

Для выполнения JS необходимо добавить `allow-scripts`, но **категорически нельзя** добавлять `allow-same-origin` вместе с `allow-scripts` — это полностью обнуляет защиту sandbox.

```html
<!-- ПРАВИЛЬНО: скрипты работают, но без доступа к origin родителя -->
<iframe sandbox="allow-scripts"></iframe>

<!-- ОПАСНО: скрипт может удалить атрибут sandbox сам у себя -->
<iframe sandbox="allow-scripts allow-same-origin"></iframe>
```

### 2.3. Рекомендуемый набор флагов

```html
<iframe
  sandbox="allow-scripts"
  src="about:blank"
></iframe>
```

Только `allow-scripts`. Ничего больше. Любой дополнительный флаг должен быть обоснован.

| Флаг | Разрешать? | Причина |
|---|---|---|
| `allow-scripts` | Да | Необходим для выполнения JS |
| `allow-same-origin` | **Нет** | Даёт полный доступ к ресурсам родителя |
| `allow-forms` | Нет | Нет необходимости отправлять формы |
| `allow-popups` | Нет | Предотвращает открытие новых окон |
| `allow-top-navigation` | **Нет** | Предотвращает перенаправление пользователя |
| `allow-modals` | Нет | Предотвращает блокирующие диалоги |

---

## 3. Изоляция origin: `srcdoc` и blob-URL

### 3.1. Использование `srcdoc`

Атрибут `srcdoc` позволяет задать содержимое iframe inline, без сетевого запроса. В сочетании с `sandbox="allow-scripts"` iframe получает **opaque origin** — уникальный origin, не совпадающий ни с каким другим:

```html
<iframe
  sandbox="allow-scripts"
  srcdoc="<script>console.log(document.domain); // пусто</script>"
></iframe>
```

> **Спецификация:** [HTML — srcdoc](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-srcdoc)

### 3.2. Использование blob-URL

Альтернатива — создание blob-URL из строки с HTML:

```js
const code = `<script>/* пользовательский код */</script>`;
const blob = new Blob([code], { type: 'text/html' });
const url = URL.createObjectURL(blob);

const iframe = document.createElement('iframe');
iframe.sandbox = 'allow-scripts';
iframe.src = url;
document.body.appendChild(iframe);

// Освободить память после загрузки
iframe.onload = () => URL.revokeObjectURL(url);
```

---

## 4. Content Security Policy (CSP)

CSP — дополнительный слой защиты. Задаётся как HTTP-заголовок или `<meta>`-тег внутри iframe.

### 4.1. CSP для iframe с пользовательским кодом

```html
<iframe
  sandbox="allow-scripts"
  srcdoc="
    <meta http-equiv='Content-Security-Policy'
          content=\"default-src 'none'; script-src 'unsafe-inline';\">
    <script>
      // пользовательский код здесь
    </script>
  "
></iframe>
```

Разбор директив:

| Директива | Значение | Эффект |
|---|---|---|
| `default-src 'none'` | Запретить всё по умолчанию | Нет загрузки изображений, шрифтов, стилей, iframe и т.д. |
| `script-src 'unsafe-inline'` | Разрешить inline-скрипты | Код в `<script>` выполняется |

Это значит, что пользовательский код **не сможет**:

- Загружать внешние скрипты (`<script src="...">`)
- Делать fetch/XHR-запросы (`connect-src` заблокирован)
- Загружать изображения, стили, шрифты
- Создавать вложенные iframe

> **Спецификация:** [W3C CSP Level 3](https://www.w3.org/TR/CSP3/)

### 4.2. Если нужен доступ к сети

Если задача требует разрешить сетевые запросы (например, учебный sandbox для fetch API), ограничьте домены:

```
Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; connect-src https://api.example.com;
```

---

## 5. Коммуникация: `postMessage`

Единственный разрешённый канал связи между родителем и sandbox-iframe — `window.postMessage()`.

### 5.1. Отправка кода в iframe

**Родитель:**

```js
const iframe = document.querySelector('#sandbox');

iframe.contentWindow.postMessage({
  type: 'execute',
  code: 'console.log(1 + 2)'
}, '*');
```

**Внутри iframe (srcdoc):**

```html
<script>
window.addEventListener('message', (event) => {
  if (event.data?.type === 'execute') {
    try {
      const result = eval(event.data.code);
      event.source.postMessage({
        type: 'result',
        value: result
      }, event.origin);
    } catch (e) {
      event.source.postMessage({
        type: 'error',
        message: e.message
      }, event.origin);
    }
  }
});
</script>
```

### 5.2. Валидация origin на стороне родителя

```js
window.addEventListener('message', (event) => {
  // origin iframe с sandbox="allow-scripts" (без allow-same-origin) — 'null'
  if (event.origin !== 'null') return;

  // Дополнительно: проверяем, что сообщение от нашего iframe
  if (event.source !== iframe.contentWindow) return;

  console.log('Результат:', event.data);
});
```

> **Спецификация:** [HTML — postMessage](https://html.spec.whatwg.org/multipage/web-messaging.html#dom-window-postmessage)

---

## 6. Защита от DoS: ограничение ресурсов

Sandbox не ограничивает CPU и память. Это нужно делать отдельно.

### 6.1. Таймаут выполнения через Web Worker внутри iframe

Внутри iframe пользовательский код запускается в Web Worker, который можно убить по таймауту:

```html
<!-- srcdoc содержимое iframe -->
<script>
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'execute') return;

  const workerCode = `
    self.onmessage = function(e) {
      try {
        const result = (0, eval)(e.data);
        self.postMessage({ type: 'result', value: String(result) });
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const worker = new Worker(URL.createObjectURL(blob));

  const timeout = setTimeout(() => {
    worker.terminate();
    event.source.postMessage({
      type: 'error',
      message: 'Execution timed out'
    }, event.origin);
  }, 5000); // 5 секунд максимум

  worker.onmessage = (e) => {
    clearTimeout(timeout);
    worker.terminate();
    event.source.postMessage(e.data, event.origin);
  };

  worker.postMessage(event.data.code);
});
</script>
```

### 6.2. Полная перезагрузка iframe

Если iframe «завис» (бесконечный цикл в основном потоке), единственный способ — удалить и пересоздать iframe:

```js
function resetSandbox() {
  const old = document.querySelector('#sandbox');
  const parent = old.parentElement;
  const clone = old.cloneNode(false); // без содержимого
  parent.replaceChild(clone, old);
}
```

---

## 7. Перехват console и ограничение глобальных API

Внутри iframe перед выполнением пользовательского кода можно переопределить или удалить опасные API:

```html
<script>
// Перехват console для передачи вывода родителю
const originalConsole = console;
window.console = {
  log: (...args) => {
    parent.postMessage({
      type: 'console',
      method: 'log',
      args: args.map(a => String(a))
    }, '*');
  },
  error: (...args) => {
    parent.postMessage({
      type: 'console',
      method: 'error',
      args: args.map(a => String(a))
    }, '*');
  },
  warn: (...args) => {
    parent.postMessage({
      type: 'console',
      method: 'warn',
      args: args.map(a => String(a))
    }, '*');
  }
};

// Удаление опасных API
delete window.fetch;
delete window.XMLHttpRequest;
delete window.WebSocket;
delete window.EventSource;
delete window.navigator.sendBeacon;

// Блокировка создания элементов, способных делать сетевые запросы
const originalCreateElement = document.createElement.bind(document);
document.createElement = function(tag) {
  const blocked = ['script', 'link', 'img', 'iframe', 'object', 'embed'];
  if (blocked.includes(tag.toLowerCase())) {
    throw new Error(`Creating <${tag}> is not allowed`);
  }
  return originalCreateElement(tag);
};
</script>
```

> **Примечание:** Удаление API через `delete` и переопределение — мера «defense in depth». Основная защита — sandbox + CSP. Пользовательский код теоретически может обойти переопределения через прототипы, поэтому полагаться только на них нельзя.

---

## 8. Атрибут `allow` (Permissions Policy)

Атрибут `allow` на iframe контролирует доступ к API устройств.

### 8.1. Режим полной блокировки (по умолчанию)

Если пользовательскому коду **не нужен** доступ к устройствам:

```html
<iframe
  sandbox="allow-scripts"
  allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; bluetooth 'none'"
  srcdoc="..."
></iframe>
```

### 8.2. Разрешение камеры и микрофона

Если пользовательскому коду **нужен** доступ к камере/микрофону (например, sandbox для WebRTC-экспериментов), необходимо выполнить **три условия одновременно**:

#### Условие 1: Permissions Policy на iframe

```html
<iframe
  sandbox="allow-scripts"
  allow="camera 'src'; microphone 'src'"
  srcdoc="..."
></iframe>
```

Значение `'src'` делегирует разрешение origin содержимого iframe. Для `srcdoc` это opaque origin, поэтому **на практике** работает только вариант с отдельным origin (см. ниже).

#### Условие 2: HTTPS

`getUserMedia()` работает только в secure context. Родительская страница **обязана** быть загружена по HTTPS (или `localhost`).

#### Условие 3: Пользовательский запрос разрешения

Браузер покажет стандартный диалог запроса разрешения. Пользователь должен явно согласиться.

### 8.3. Проблема: `srcdoc` + камера/микрофон

`srcdoc` iframe с `sandbox="allow-scripts"` (без `allow-same-origin`) получает **opaque origin**. Большинство браузеров **не позволяют** opaque origin вызывать `getUserMedia()` — запрос будет отклонён автоматически.

**Решение — отдельный origin для sandbox:**

Разместить содержимое sandbox на отдельном домене (например, `sandbox.example.com`) и загружать iframe по URL:

```html
<iframe
  sandbox="allow-scripts allow-same-origin"
  allow="camera https://sandbox.example.com; microphone https://sandbox.example.com"
  src="https://sandbox.example.com/runner.html"
></iframe>
```

> **Внимание:** здесь используется `allow-same-origin`, что обычно запрещено (см. раздел 2.2). Это безопасно **только при условии**, что `sandbox.example.com` — **отдельный домен**, не совпадающий с origin родительской страницы. Тогда iframe не может манипулировать родителем, несмотря на `allow-same-origin`.

### 8.4. Сравнение подходов

| Подход | Камера/микрофон | Изоляция | Сложность |
|---|---|---|---|
| `srcdoc` + `sandbox="allow-scripts"` | Нет | Максимальная (opaque origin) | Минимальная |
| Отдельный домен + `sandbox="allow-scripts allow-same-origin"` | Да | Высокая (cross-origin, но не opaque) | Средняя: нужен отдельный домен |
| Отдельный домен без `sandbox` | Да | Только cross-origin | Не рекомендуется |

### 8.5. CSP при разрешении медиа

Если камера/микрофон разрешены, CSP внутри iframe нужно расширить:

```
Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; media-src blob: mediastream:;
```

Директива `media-src blob: mediastream:` разрешает `<video>`/`<audio>` элементам использовать потоки с камеры и blob-URL для их воспроизведения.

### 8.6. Пример: sandbox с камерой

**runner.html** (на `sandbox.example.com`):

```html
<!DOCTYPE html>
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; media-src blob: mediastream:;">
<script>
window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'execute') return;

  // Код пользователя может вызвать getUserMedia
  try {
    const result = await eval(event.data.code);
    event.source.postMessage({ type: 'result', value: String(result) }, event.origin);
  } catch (e) {
    event.source.postMessage({ type: 'error', message: e.message }, event.origin);
  }
});
</script>
```

**Родительская страница** (на `app.example.com`):

```html
<iframe
  id="sandbox"
  sandbox="allow-scripts allow-same-origin"
  allow="camera https://sandbox.example.com; microphone https://sandbox.example.com"
  src="https://sandbox.example.com/runner.html"
></iframe>

<script>
const iframe = document.getElementById('sandbox');

// Пользовательский код, который запрашивает камеру
const userCode = `
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  document.body.appendChild(video);
  'Камера активирована';
`;

iframe.onload = () => {
  iframe.contentWindow.postMessage({
    type: 'execute',
    code: userCode
  }, 'https://sandbox.example.com');
};
</script>
```

### 8.7. Управление жизненным циклом потоков

Важно останавливать медиа-потоки при пересоздании iframe, иначе камера/микрофон останутся активными:

```js
function resetSandbox() {
  const old = document.getElementById('sandbox');
  // Браузер автоматически останавливает потоки при удалении iframe,
  // но для надёжности можно предварительно запросить остановку:
  old.contentWindow?.postMessage({ type: 'stop-media' }, 'https://sandbox.example.com');
  // Пересоздание
  const clone = old.cloneNode(false);
  old.parentElement.replaceChild(clone, old);
}
```

> **Спецификация:** [W3C Permissions Policy](https://www.w3.org/TR/permissions-policy-1/)
> **Спецификация:** [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)

---

## 9. Итоговая архитектура

```
┌─────────────────────────────────────────┐
│  Родительская страница                  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  <iframe                          │  │
│  │    sandbox="allow-scripts"        │  │
│  │    allow="camera 'none'; ..."     │  │
│  │    srcdoc="...">                  │  │
│  │                                   │  │
│  │  CSP: default-src 'none';         │  │
│  │       script-src 'unsafe-inline'  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Web Worker                 │  │  │
│  │  │  (пользовательский код)     │  │  │
│  │  │  + таймаут 5 сек            │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  opaque origin, нет доступа к:      │  │
│  │  - DOM родителя                   │  │
│  │  - cookies / storage              │  │
│  │  - сети                           │  │
│  │  - popup / навигация              │  │
│  └───────────────────────────────────┘  │
│                                         │
│  postMessage ←→ единственный канал      │
└─────────────────────────────────────────┘
```

**Вариант с камерой/микрофоном (отдельный домен):**

```
┌─────────────────────────────────────────────┐
│  app.example.com (HTTPS)                    │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │  <iframe                              │  │
│  │    sandbox="allow-scripts             │  │
│  │             allow-same-origin"        │  │
│  │    allow="camera ...; microphone ..." │  │
│  │    src="sandbox.example.com/runner">  │  │
│  │                                       │  │
│  │  CSP: + media-src blob: mediastream:  │  │
│  │                                       │  │
│  │  cross-origin (≠ app.example.com)     │  │
│  │  getUserMedia() — доступен            │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  postMessage ←→ единственный канал          │
└─────────────────────────────────────────────┘
```

---

## 10. Итоговый пример: минимальный sandbox

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>JS Sandbox</title>
</head>
<body>
  <textarea id="code" rows="10" cols="60">console.log('Привет из sandbox!');</textarea>
  <br>
  <button id="run">Выполнить</button>
  <pre id="output"></pre>

  <script>
    const SANDBOX_SRCDOC = `
      <meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; script-src 'unsafe-inline';">
      <script>
        delete window.fetch;
        delete window.XMLHttpRequest;
        delete window.WebSocket;

        window.console = {
          log: (...a) => parent.postMessage({ type:'console', method:'log', args:a.map(String) }, '*'),
          error: (...a) => parent.postMessage({ type:'console', method:'error', args:a.map(String) }, '*'),
          warn: (...a) => parent.postMessage({ type:'console', method:'warn', args:a.map(String) }, '*'),
        };

        window.addEventListener('message', (e) => {
          if (e.data?.type !== 'execute') return;

          const blob = new Blob([
            'self.onmessage=function(e){try{const r=(0,eval)(e.data);self.postMessage({type:"result",value:String(r)})}catch(err){self.postMessage({type:"error",message:err.message})}};'
          ], { type: 'application/javascript' });
          const w = new Worker(URL.createObjectURL(blob));

          const t = setTimeout(() => {
            w.terminate();
            parent.postMessage({ type:'error', message:'Timeout' }, '*');
          }, 5000);

          w.onmessage = (ev) => {
            clearTimeout(t);
            w.terminate();
            parent.postMessage(ev.data, '*');
          };

          w.postMessage(e.data.code);
        });
      <\/script>
    `;

    let iframe;

    function createSandbox() {
      if (iframe) iframe.remove();
      iframe = document.createElement('iframe');
      iframe.sandbox = 'allow-scripts';
      iframe.allow = "camera 'none'; microphone 'none'; geolocation 'none'";
      iframe.srcdoc = SANDBOX_SRCDOC;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
    }

    createSandbox();

    const output = document.getElementById('output');

    window.addEventListener('message', (e) => {
      if (e.source !== iframe?.contentWindow) return;
      const d = e.data;
      if (d.type === 'console') {
        output.textContent += `[${d.method}] ${d.args.join(' ')}\n`;
      } else if (d.type === 'result') {
        output.textContent += `=> ${d.value}\n`;
      } else if (d.type === 'error') {
        output.textContent += `[ERROR] ${d.message}\n`;
      }
    });

    document.getElementById('run').addEventListener('click', () => {
      output.textContent = '';
      createSandbox();
      // Ждём загрузки iframe
      iframe.onload = () => {
        iframe.contentWindow.postMessage({
          type: 'execute',
          code: document.getElementById('code').value
        }, '*');
      };
    });
  </script>
</body>
</html>
```

---

## 11. Тестовые примеры: автоматическая проверка изоляции

Каждый тест пытается выполнить конкретный вектор атаки изнутри sandbox-iframe. Ожидаемый результат — **блокировка**. Если атака проходит — конфигурация небезопасна.

### 11.1. Тестовый harness

Файл [`sandbox-tests.html`](sandbox-tests.html) — автономная страница, которая создаёт sandbox-iframe, последовательно выполняет в нём 20 атакующих сценариев и выводит результат PASS/FAIL.

Принцип работы:
1. Для каждого теста создаётся отдельный `<iframe sandbox="allow-scripts">` с CSP и defense-in-depth настройками
2. Внутри iframe выполняется код, пытающийся провести конкретную атаку
3. Результат (`blocked: true/false`) отправляется родителю через `postMessage`
4. Если iframe не отвечает в течение 8 секунд — тест считается пройденным (атака заблокирована)

### 11.2. Описание тестов

| # | Вектор | Ожидаемое поведение | Слой защиты |
|---|---|---|---|
| 1 | Чтение `window.parent.document` | `SecurityError` — cross-origin доступ | sandbox (opaque origin) |
| 2 | Чтение `document.cookie` | Пустая строка (opaque origin не хранит cookies) | sandbox (opaque origin) |
| 3 | Запись в `localStorage` | `SecurityError` | sandbox (opaque origin) |
| 4 | Запись в `sessionStorage` | `SecurityError` | sandbox (opaque origin) |
| 5 | Чтение `top.location` | `SecurityError` | sandbox (opaque origin) |
| 6 | `window.open()` | Возвращает `null` | sandbox (без allow-popups) |
| 7 | `alert()` | Исключение или no-op | sandbox (без allow-modals) |
| 8 | `fetch()` | `undefined` (удалён) или CSP-блокировка | defense-in-depth + CSP connect-src |
| 9 | `XMLHttpRequest` | `undefined` (удалён) или CSP-блокировка | defense-in-depth + CSP connect-src |
| 10 | `WebSocket` | `undefined` (удалён) или CSP-блокировка | defense-in-depth + CSP connect-src |
| 11 | Внешний `<script src>` | CSP блокирует загрузку | CSP script-src |
| 12 | Вложенный `<iframe>` | CSP блокирует | CSP default-src / child-src |
| 13 | `navigator.sendBeacon` | Удалён или CSP-блокировка | defense-in-depth + CSP |
| 14 | `getUserMedia()` (камера) | `NotAllowedError` | Permissions Policy |
| 15 | `geolocation` | `PositionError` / блокировка | Permissions Policy |
| 16 | Восстановление `fetch` через прототип | CSP всё равно заблокирует запрос | CSP (основной слой) |
| 17 | Бесконечный цикл в Worker | Worker убит по таймауту | Web Worker + `terminate()` |
| 18 | Выделение памяти в Worker | Worker убит по таймауту или OOM | Web Worker + `terminate()` |
| 19 | `form.submit()` | Блокировка без allow-forms | sandbox (без allow-forms) |
| 20 | Удаление атрибута `sandbox` | `frameElement === null` (cross-origin) | sandbox (opaque origin) |

### 11.3. Интерпретация результатов

- **Все PASS** — конфигурация sandbox соответствует спецификации, все описанные векторы атак заблокированы.
- **FAIL на тестах 1–7, 19–20** — ошибка в атрибуте `sandbox`. Убедитесь, что не добавлен `allow-same-origin`.
- **FAIL на тестах 8–13** — ошибка в CSP. Проверьте директивы `default-src`, `script-src`, `connect-src`.
- **FAIL на тестах 14–15** — ошибка в Permissions Policy (атрибут `allow`).
- **FAIL на тесте 16** — CSP `connect-src` не задан или слишком разрешительный. Это критически важный тест: он показывает, что даже при обходе JS-уровня защиты сеть всё равно заблокирована.
- **FAIL на тестах 17–18** — отсутствует механизм таймаута Worker. Добавьте `setTimeout` + `worker.terminate()`.

### 11.4. Запуск

Файл самодостаточный — откройте `sandbox-tests.html` в браузере и нажмите «Запустить все тесты». Работает локально через `file://` или любой HTTP-сервер.

Для автоматизации в CI (например, через Playwright):

```js
// sandbox-tests.spec.js
const { test, expect } = require('@playwright/test');

test('Все векторы атак заблокированы sandbox', async ({ page }) => {
  await page.goto('http://localhost:3000/sandbox-tests.html');
  await page.click('#run');

  // Ждём завершения всех тестов (макс 60 сек)
  await expect(page.locator('p strong')).toContainText('Итого', { timeout: 60000 });

  // Проверяем что нет FAIL
  const failCount = await page.locator('.fail').count();
  expect(failCount).toBe(0);
});
```

---

## 12. Статический анализ кода (SAST) и sandbox

### 12.1. Нужен ли SAST для пользовательского кода в sandbox?

**Нет.** При корректно настроенной изоляции (`sandbox="allow-scripts"` без `allow-same-origin`, CSP `default-src 'none'; script-src 'unsafe-inline'`, Permissions Policy) статический анализ пользовательского кода не добавляет безопасности.

### 12.2. Почему SAST не помогает

| Аргумент | Пояснение |
|---|---|
| Sandbox считает весь код враждебным | Модель угроз sandbox — полное недоверие к исполняемому коду. Не имеет значения, содержит ли код `eval`, prototype pollution или любой другой паттерн — sandbox ограничивает возможности любого кода одинаково. |
| Нет доверенного кода для эксплуатации | SAST ищет уязвимости в коде, через которые атакующий получает доступ к ресурсам. Внутри sandbox нет ресурсов: нет DOM родителя, cookies, storage, сети, навигации. Код может «навредить» только самому себе. |
| Ложное чувство безопасности | SAST будет генерировать шум: `eval` — нормальная операция внутри sandbox-runner, `while(true)` — допустимо при наличии Worker + таймаут. Фильтрация ложных срабатываний потребует усилий без пользы для безопасности. |
| Runtime-атаки не обнаруживаются | SAST анализирует код статически. Обфусцированный или динамически генерируемый код (через `Function()`, `setTimeout('code')`) пройдёт мимо анализатора, но будет заблокирован sandbox на уровне браузера. |

### 12.3. Когда SAST оправдан

SAST полезен, если граница изоляции размыта или ослаблена:

| Сценарий | Почему SAST помогает |
|---|---|
| Серверное выполнение (Node.js sandbox, `vm2`, `isolated-vm`) | Серверные sandbox имеют историю побегов. SAST может выявить известные паттерны обхода до выполнения. |
| `allow-same-origin` в sandbox | Код получает доступ к origin родителя. SAST может обнаружить попытки манипуляции с `frameElement.removeAttribute('sandbox')`. |
| Shared state между sandbox и host | Если родитель передаёт в iframe объекты или слушает произвольные `postMessage` без валидации, SAST на стороне **родителя** (не sandbox) поможет найти уязвимости в обработчике. |
| Код исполняется вне iframe | Если по какой-то причине пользовательский код выполняется в контексте основной страницы (например, через `eval` без sandbox), SAST — единственная линия защиты. |

### 12.4. Рекомендация

Вместо SAST пользовательского кода — направить усилия на:

1. **Автоматическое тестирование конфигурации sandbox** (см. раздел 11) — убедиться, что все векторы атак заблокированы.
2. **SAST кода родительской страницы** — проверить, что обработчик `postMessage` валидирует `event.source` и `event.origin`, не выполняет произвольный код из сообщений, не передаёт чувствительные данные в iframe.
3. **Мониторинг CSP-нарушений** через заголовок `Content-Security-Policy-Report-Only` и `report-uri` / `report-to` — обнаружить попытки обхода CSP в реальном времени.

---

## 13. Ссылки на спецификации

| Механизм | Спецификация |
|---|---|
| iframe sandbox | [HTML Living Standard — Sandboxing](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox) |
| srcdoc | [HTML — srcdoc](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-srcdoc) |
| Content Security Policy | [W3C CSP Level 3](https://www.w3.org/TR/CSP3/) |
| postMessage | [HTML — Web Messaging](https://html.spec.whatwg.org/multipage/web-messaging.html) |
| Permissions Policy | [W3C Permissions Policy](https://www.w3.org/TR/permissions-policy-1/) |
| Web Workers | [HTML — Web Workers](https://html.spec.whatwg.org/multipage/workers.html) |
| Opaque Origin | [HTML — Origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin-opaque) |
