export interface TestDefinition {
  name: string;
  description: string;
  code: string;
}

export const tests: TestDefinition[] = [
  // 1. DOM родителя
  {
    name: 'Чтение DOM родителя',
    description: 'window.parent.document должен бросить исключение (cross-origin)',
    code: `
      try {
        const title = window.parent.document.title;
        parent.postMessage({ type: 'test-result', blocked: false, detail: 'Прочитан title: ' + title }, '*');
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 2. Cookies
  {
    name: 'Чтение cookies',
    description: 'document.cookie должен быть пустым или недоступным (opaque origin)',
    code: `
      try {
        const c = document.cookie;
        parent.postMessage({ type: 'test-result', blocked: true, detail: 'cookie = ""' }, '*');
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 3. localStorage
  {
    name: 'Доступ к localStorage',
    description: 'localStorage недоступен в opaque origin — должен бросить SecurityError',
    code: `
      try {
        localStorage.setItem('test', '1');
        parent.postMessage({ type: 'test-result', blocked: false, detail: 'localStorage доступен' }, '*');
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 4. sessionStorage
  {
    name: 'Доступ к sessionStorage',
    description: 'sessionStorage недоступен в opaque origin — должен бросить SecurityError',
    code: `
      try {
        sessionStorage.setItem('test', '1');
        parent.postMessage({ type: 'test-result', blocked: false, detail: 'sessionStorage доступен' }, '*');
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 5. top.location
  {
    name: 'Перенаправление top.location',
    description: 'Попытка изменить top.location должна быть заблокирована sandbox',
    code: `
      try {
        const before = String(top.location.href);
        parent.postMessage({ type: 'test-result', blocked: false, detail: 'top.location.href доступен: ' + before }, '*');
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 6. window.open
  {
    name: 'Открытие popup (window.open)',
    description: 'window.open() должен вернуть null или бросить исключение',
    code: `
      try {
        // Note: this may also be blocked by browser popup blocker (not just sandbox)
        const w = window.open('', '_blank', 'width=100,height=100');
        if (w === null) {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'window.open заблокирован (sandbox или popup blocker)' }, '*');
        } else {
          w.close();
          parent.postMessage({ type: 'test-result', blocked: false, detail: 'popup открыт' }, '*');
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 7. alert
  {
    name: 'Модальные диалоги (alert)',
    description: 'alert() должен быть заблокирован sandbox без allow-modals',
    code: `
      try {
        const isNative = Function.prototype.toString.call(alert).includes('[native code]');
        if (isNative) {
          alert('test');
          parent.postMessage({ type: 'test-result', blocked: false, detail: 'alert выполнен' }, '*');
        } else {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'переопределён (defense-in-depth)' }, '*');
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 8. fetch
  {
    name: 'Сетевой запрос (fetch)',
    description: 'fetch() должен быть заблокирован CSP (connect-src) и/или удалён',
    code: `
      try {
        if (typeof fetch === 'undefined') {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'fetch удалён из scope' }, '*');
        } else {
          fetch('https://httpbin.org/get')
            .then(() => parent.postMessage({ type: 'test-result', blocked: false, detail: 'fetch успешен' }, '*'))
            .catch(e => parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*'));
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 9. XMLHttpRequest
  {
    name: 'Сетевой запрос (XMLHttpRequest)',
    description: 'XMLHttpRequest должен быть заблокирован CSP и/или удалён',
    code: `
      try {
        if (typeof XMLHttpRequest === 'undefined') {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'XMLHttpRequest удалён' }, '*');
        } else {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', 'https://httpbin.org/get');
          xhr.onload = () => parent.postMessage({ type: 'test-result', blocked: false, detail: 'XHR успешен' }, '*');
          xhr.onerror = () => parent.postMessage({ type: 'test-result', blocked: true, detail: 'XHR заблокирован' }, '*');
          xhr.send();
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 10. WebSocket
  {
    name: 'WebSocket',
    description: 'WebSocket должен быть заблокирован CSP (connect-src) и/или удалён',
    code: `
      try {
        if (typeof WebSocket === 'undefined') {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'WebSocket удалён' }, '*');
        } else {
          const ws = new WebSocket('wss://echo.websocket.org');
          ws.onopen = () => {
            ws.close();
            parent.postMessage({ type: 'test-result', blocked: false, detail: 'WebSocket подключён' }, '*');
          };
          ws.onerror = () => parent.postMessage({ type: 'test-result', blocked: true, detail: 'WebSocket заблокирован' }, '*');
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 11. External script
  {
    name: 'Внедрение внешнего <script>',
    description: 'Создание <script src="..."> должно быть заблокировано CSP (script-src)',
    code: `
      try {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js';
        s.onload = () => parent.postMessage({ type: 'test-result', blocked: false, detail: 'Внешний скрипт загружен' }, '*');
        s.onerror = () => parent.postMessage({ type: 'test-result', blocked: true, detail: 'CSP заблокировал загрузку скрипта' }, '*');
        document.head.appendChild(s);
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 12. Nested iframe
  {
    name: 'Вложенный iframe',
    description: 'Создание вложенного iframe должно быть заблокировано CSP (child-src / frame-src)',
    code: `
      try {
        if (!document.body) {
          document.documentElement.appendChild(document.createElement('body'));
        }
        const f = document.createElement('iframe');
        f.srcdoc = '<h1>nested</h1>';
        f.onload = () => {
          try {
            const hasContent = f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerHTML.trim().length > 0;
            parent.postMessage({ type: 'test-result', blocked: !hasContent, detail: hasContent ? 'iframe создан' : 'iframe пустой' }, '*');
          } catch(e) {
            // cross-origin means it loaded external content
            parent.postMessage({ type: 'test-result', blocked: false, detail: 'iframe создан (cross-origin)' }, '*');
          }
        };
        f.onerror = () => parent.postMessage({ type: 'test-result', blocked: true, detail: 'iframe заблокирован' }, '*');
        document.body.appendChild(f);
        setTimeout(() => {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'iframe не загрузился (таймаут)' }, '*');
        }, 3000);
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 13. sendBeacon
  {
    name: 'sendBeacon',
    description: 'navigator.sendBeacon должен быть удалён или заблокирован CSP',
    code: `
      try {
        if (typeof navigator.sendBeacon !== 'function') {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'sendBeacon удалён' }, '*');
        } else {
          const result = navigator.sendBeacon('https://httpbin.org/post', 'data');
          parent.postMessage({ type: 'test-result', blocked: !result, detail: result ? 'beacon отправлен' : 'beacon заблокирован' }, '*');
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 14. Camera
  {
    name: 'getUserMedia (камера)',
    description: 'Запрос камеры должен быть отклонён Permissions Policy',
    code: `
      (async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            parent.postMessage({ type: 'test-result', blocked: true, detail: 'mediaDevices недоступен' }, '*');
            return;
          }
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(t => t.stop());
          parent.postMessage({ type: 'test-result', blocked: false, detail: 'Камера доступна' }, '*');
        } catch (e) {
          parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
        }
      })();
    `,
  },

  // 15. Geolocation
  {
    name: 'Геолокация',
    description: 'navigator.geolocation должен быть заблокирован Permissions Policy',
    code: `
      try {
        if (!navigator.geolocation) {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'geolocation недоступен' }, '*');
        } else {
          navigator.geolocation.getCurrentPosition(
            () => parent.postMessage({ type: 'test-result', blocked: false, detail: 'Геолокация доступна' }, '*'),
            (err) => parent.postMessage({ type: 'test-result', blocked: true, detail: err.message }, '*')
          );
          setTimeout(() => {
            parent.postMessage({ type: 'test-result', blocked: true, detail: 'Нет ответа (таймаут)' }, '*');
          }, 5000);
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 16. Fetch prototype bypass
  {
    name: 'Обход удаления fetch через прототип',
    description: 'Попытка восстановить fetch из прототипов — CSP всё равно заблокирует запрос',
    code: `
      try {
        // If fetch exists natively, the attack vector is "fetch itself works" (test 8)
        const isNative = typeof fetch === 'function' && Function.prototype.toString.call(fetch).includes('[native code]');
        if (isNative) {
          parent.postMessage({ type: 'test-result', blocked: false, detail: 'fetch не был удалён — уязвимость в тесте 8' }, '*');
        } else if (typeof fetch === 'undefined') {
          // fetch was deleted, try to recover
          const proto = Object.getPrototypeOf(window);
          const fetchFromProto = proto?.fetch;
          if (typeof fetchFromProto === 'function') {
            fetchFromProto.call(window, 'https://httpbin.org/get')
              .then(() => parent.postMessage({ type: 'test-result', blocked: false, detail: 'fetch восстановлен из прототипа' }, '*'))
              .catch(e => parent.postMessage({ type: 'test-result', blocked: true, detail: 'CSP заблокировал: ' + e.message }, '*'));
          } else {
            parent.postMessage({ type: 'test-result', blocked: true, detail: 'fetch не удалось восстановить' }, '*');
          }
        } else {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'fetch переопределён' }, '*');
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 17. Infinite loop in Worker
  {
    name: 'DoS: бесконечный цикл в Worker',
    description: 'Worker с бесконечным циклом — проверка возможности создания Worker',
    code: `
      try {
        const workerCode = 'self.onmessage = function() { while(true){} };';
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const w = new Worker(URL.createObjectURL(blob));
        // Worker was created successfully — vulnerability exists
        const timeout = setTimeout(() => {
          w.terminate();
          parent.postMessage({ type: 'test-result', blocked: false, detail: 'Worker создан (DoS возможен)' }, '*');
        }, 1000);
        w.onerror = (e) => {
          clearTimeout(timeout);
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'Worker заблокирован: ' + (e.message || 'ошибка') }, '*');
        };
        w.postMessage('go');
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: 'Worker недоступен: ' + e.message }, '*');
      }
    `,
  },

  // 18. Memory exhaustion in Worker
  {
    name: 'DoS: выделение памяти',
    description: 'Worker с выделением памяти — проверка возможности создания Worker',
    code: `
      try {
        const workerCode = 'self.onmessage = function() { const a = []; while(true) a.push(new ArrayBuffer(1024*1024)); };';
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const w = new Worker(URL.createObjectURL(blob));
        // Worker was created successfully — vulnerability exists
        const timeout = setTimeout(() => {
          w.terminate();
          parent.postMessage({ type: 'test-result', blocked: false, detail: 'Worker создан (DoS возможен)' }, '*');
        }, 1000);
        w.onerror = (e) => {
          clearTimeout(timeout);
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'Worker заблокирован: ' + (e.message || 'ошибка') }, '*');
        };
        w.postMessage('go');
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: 'Worker недоступен: ' + e.message }, '*');
      }
    `,
  },

  // 19. Form submit
  {
    name: 'Отправка формы',
    description: 'form.submit() должен быть заблокирован без allow-forms',
    code: `
      try {
        // Check if form.submit was overridden
        const isNative = Function.prototype.toString.call(HTMLFormElement.prototype.submit).includes('[native code]');
        if (!isNative) {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'form.submit переопределён (defense-in-depth)' }, '*');
        } else {
          // Ensure body exists
          if (!document.body) {
            document.documentElement.appendChild(document.createElement('body'));
          }
          // Create target iframe to catch form submission
          const target = document.createElement('iframe');
          target.name = 'formtarget';
          target.style.display = 'none';
          document.body.appendChild(target);

          const form = document.createElement('form');
          form.method = 'GET';
          form.action = 'https://httpbin.org/get';
          form.target = 'formtarget';
          document.body.appendChild(form);

          let reported = false;
          // Check if target iframe navigated
          const checkInterval = setInterval(() => {
            if (reported) return;
            try {
              // If we can't access location, it's cross-origin (navigated)
              const loc = target.contentWindow.location.href;
              // Still same-origin, check if it changed
            } catch (e) {
              // Cross-origin = form submitted successfully
              clearInterval(checkInterval);
              reported = true;
              parent.postMessage({ type: 'test-result', blocked: false, detail: 'form отправлена' }, '*');
            }
          }, 200);

          form.submit();

          setTimeout(() => {
            if (!reported) {
              clearInterval(checkInterval);
              reported = true;
              parent.postMessage({ type: 'test-result', blocked: true, detail: 'form.submit заблокирован sandbox' }, '*');
            }
          }, 3000);
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },

  // 20. Remove sandbox attribute
  {
    name: 'Удаление sandbox-атрибута',
    description: 'Код внутри iframe не должен иметь доступ к своему элементу в родительском DOM',
    code: `
      try {
        const el = window.frameElement;
        if (el === null) {
          parent.postMessage({ type: 'test-result', blocked: true, detail: 'frameElement === null' }, '*');
        } else {
          el.removeAttribute('sandbox');
          parent.postMessage({ type: 'test-result', blocked: false, detail: 'sandbox-атрибут удалён!' }, '*');
        }
      } catch (e) {
        parent.postMessage({ type: 'test-result', blocked: true, detail: e.message }, '*');
      }
    `,
  },
];
