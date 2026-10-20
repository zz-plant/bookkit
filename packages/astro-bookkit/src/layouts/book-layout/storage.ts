export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * `window.localStorage`, looked up on each call. When the browser blocks
 * storage, reading that property throws a SecurityError; deferring it to here
 * lets the helpers below catch it instead of the importing module failing.
 */
export const deferredLocalStorage: StorageLike & Pick<Storage, "removeItem"> = {
	getItem: (key) => window.localStorage.getItem(key),
	setItem: (key, value) => window.localStorage.setItem(key, value),
	removeItem: (key) => window.localStorage.removeItem(key),
};

export const readStoredValue = (
	storage: StorageLike,
	key: string,
): string | null => {
	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
};

export const writeStoredValue = (
	storage: StorageLike,
	key: string,
	value: string,
): void => {
	try {
		storage.setItem(key, value);
	} catch {
		// Ignore storage write failures so UI initialization keeps running.
	}
};

export const removeStoredValue = (
	storage: Pick<Storage, "removeItem">,
	key: string,
): void => {
	try {
		storage.removeItem(key);
	} catch {
		// Blocked storage has nothing to remove.
	}
};

export const readStoredJson = <T>(
	storage: StorageLike,
	key: string,
): T | null => {
	const value = readStoredValue(storage, key);
	if (!value) return null;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
};

export const writeStoredJson = (
	storage: StorageLike,
	key: string,
	value: unknown,
): void => {
	writeStoredValue(storage, key, JSON.stringify(value));
};
