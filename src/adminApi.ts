export async function readAdmin<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, { credentials: 'same-origin', signal });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw Object.assign(new Error('The POS API returned an unexpected response. Please try again.'), { status: response.status });
  }
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Unable to load data.'), { status: response.status });
  return body;
}
export async function writeAdmin<T>(path: string, data: unknown): Promise<T> {
  const { token } = await readAdmin<{ token: string }>('auth/csrf');
  const response = await fetch(`/api/${path}`, { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(data) });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Unable to save.'), { status: response.status });
  return body;
}
