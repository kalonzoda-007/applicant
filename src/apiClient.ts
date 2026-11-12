// Клиент защищённого API FATIR (Cloudflare Worker для migration-preview).
// Адрес задаётся переменной VITE_API_BASE_URL при сборке; секретов в файле нет.
const DEFAULT_BASE = 'https://fatir-miniapp-migration.kalonzoda007.workers.dev';
const base = String(import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
const TIMEOUT_MS = 30000;

type ApiError = Error & { response?: { data: unknown; status?: number } };

async function request(path: string, payload?: unknown) {
  if (!/^https:\/\//.test(base)) throw new Error('Не настроен защищённый сервер FATIR (VITE_API_BASE_URL).');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({ error: 'Некорректный ответ сервера FATIR' }));
    if (!response.ok) {
      const problem: ApiError = new Error(data?.error || 'Ошибка сервера FATIR');
      problem.response = { data, status: response.status };
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
  post: (path: string, payload?: unknown) => request(path, payload),
};
