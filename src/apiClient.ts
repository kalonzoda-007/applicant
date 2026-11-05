// GitHub Pages adapter for the same signed FATIR AppDeploy backend.
// This public file contains no authentication secrets.
const base = 'https://api-v2.appdeploy.ai/app/fatir-mini-app-j17de2';
async function request(method: string, path: string, payload?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ error: 'Ответ сервера не распознан' }));
  if (!response.ok) {
    const problem = new Error(data?.error || 'Ошибка сервера FATIR') as Error & {response?: {data: unknown}};
    problem.response = {data};
    throw problem;
  }
  return {data};
}
export const api = {
  post: (path: string, payload?: unknown) => request('POST', path, payload),
  get: (path: string) => request('GET', path),
};
