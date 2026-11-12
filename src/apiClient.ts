// GitHub Pages adapter for the same signed FATIR AppDeploy backend.
// This public file contains no authentication secrets.
const base = 'https://api-v2.appdeploy.ai/app/fatir-mini-app-j17de2';
const TIMEOUT_MS = 30000;

type ApiError = Error & { response?: { data: unknown } };

async function request(method: string, path: string, payload?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({ error: 'Ответ сервера не распознан' }));
    if (!response.ok) {
      const problem: ApiError = new Error(data?.error || 'Ошибка сервера FATIR');
      problem.response = { data };
      throw problem;
    }
    return { data };
  } catch (e) {
    const err = e as { name?: string };
    if (err?.name === 'AbortError') throw new Error('Сервер не ответил вовремя. Проверьте соединение и повторите.');
    if (e instanceof TypeError) throw new Error('Нет связи с сервером. Проверьте интернет и повторите.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  post: (path: string, payload?: unknown) => request('POST', path, payload),
  get: (path: string) => request('GET', path),
};
