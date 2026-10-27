export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) { const error=new Error(data.error || '요청을 처리하지 못했습니다.');error.code=data.code;throw error; }
  return data;
}
export const post = body => ({ method: 'POST', body: JSON.stringify(body || {}) });
