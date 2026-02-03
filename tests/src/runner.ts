import { tests, type TestDefinition } from './tests';

export interface TestResult {
  index: number;
  name: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface TestSuiteResult {
  passed: number;
  failed: number;
  tests: TestResult[];
}

function extractCSP(srcdoc: string | null): string | null {
  if (!srcdoc) return null;
  // Match content="..." (double-quoted) or content='...' (single-quoted)
  const matchDQ = srcdoc.match(/content\s*=\s*"([^"]*default-src[^"]*)"/i);
  if (matchDQ) return matchDQ[1];
  const matchSQ = srcdoc.match(/content\s*=\s*'([^']*default-src[^']*)'/i);
  if (matchSQ) return matchSQ[1];
  return null;
}

function buildSrcdoc(csp: string | null, hasDefenseInDepth: boolean, testCode: string): string {
  const cspMeta = csp
    ? `<meta http-equiv="Content-Security-Policy" content="${csp}">`
    : '';

  const defenseInDepth = hasDefenseInDepth
    ? `<script>
    delete window.fetch;
    delete window.XMLHttpRequest;
    delete window.WebSocket;
    delete window.EventSource;
    try { delete window.navigator.sendBeacon; } catch(e) {}
    window.alert = function() {};
    window.confirm = function() { return false; };
    window.prompt = function() { return null; };
    try { Object.defineProperty(Navigator.prototype, 'sendBeacon', { value: function() { return false; }, writable: false, configurable: false }); } catch(e) {}
    HTMLFormElement.prototype.submit = function() {};
    HTMLFormElement.prototype.requestSubmit = function() {};
  <\/script>`
    : '';

  return `${cspMeta}${defenseInDepth}<script>${testCode}<\/script>`;
}

function runSingleTest(
  sandboxAttr: string,
  allowAttr: string,
  csp: string | null,
  hasDefenseInDepth: boolean,
  test: TestDefinition,
  index: number,
  timeout: number
): Promise<TestResult> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    if (sandboxAttr) iframe.sandbox.value = sandboxAttr;
    if (allowAttr) iframe.allow = allowAttr;
    iframe.style.cssText = 'width:0;height:0;border:none;position:absolute;';
    iframe.srcdoc = buildSrcdoc(csp, hasDefenseInDepth, test.code);

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        index,
        name: test.name,
        description: test.description,
        passed: true,
        detail: 'Нет ответа (таймаут — заблокирован)',
      });
    }, timeout);

    const handler = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      if (event.data?.type !== 'test-result') return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve({
        index,
        name: test.name,
        description: test.description,
        passed: !!event.data.blocked,
        detail: event.data.detail || '',
      });
    };

    function cleanup() {
      window.removeEventListener('message', handler);
      iframe.remove();
    }

    window.addEventListener('message', handler);
    document.body.appendChild(iframe);
  });
}

export async function testSandbox(
  iframe: HTMLIFrameElement,
  options?: { timeout?: number }
): Promise<TestSuiteResult> {
  const timeout = options?.timeout ?? 8000;
  const sandboxAttr = iframe.getAttribute('sandbox') || '';
  const allowAttr = iframe.getAttribute('allow') || '';
  const srcdoc = iframe.getAttribute('srcdoc') || '';
  const csp = extractCSP(srcdoc);
  // Only apply defense-in-depth if target iframe has CSP (indicates secure config)
  const hasDefenseInDepth = !!csp;

  const results: TestResult[] = [];

  // Run tests sequentially to avoid postMessage collisions
  for (let i = 0; i < tests.length; i++) {
    const result = await runSingleTest(
      sandboxAttr,
      allowAttr,
      csp,
      hasDefenseInDepth,
      tests[i],
      i,
      timeout
    );
    results.push(result);
  }

  return {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    tests: results,
  };
}
