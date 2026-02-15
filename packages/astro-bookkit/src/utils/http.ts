const JSON_RESPONSE_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export const jsonResponse = (payload: unknown, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_RESPONSE_HEADERS,
  });
};

export const parseJsonBody = async (request: Request): Promise<unknown | null> => {
  try {
    return await request.json();
  } catch (_error) {
    return null;
  }
};
