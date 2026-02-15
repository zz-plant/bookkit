const JSON_RESPONSE_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false };

export const jsonResponse = (payload: unknown, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_RESPONSE_HEADERS,
  });
};

export const tryParseJsonBody = async (request: Request): Promise<JsonParseResult> => {
  try {
    return {
      ok: true,
      value: await request.json(),
    };
  } catch (_error) {
    return { ok: false };
  }
};

export const parseJsonBody = async (request: Request): Promise<unknown | null> => {
  const parsed = await tryParseJsonBody(request);
  if (!parsed.ok) return null;
  return parsed.value;
};
