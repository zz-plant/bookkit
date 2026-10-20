import {
	deferredLocalStorage,
	readStoredValue,
	type StorageLike,
	writeStoredValue,
} from "../../layouts/book-layout/storage";
import {
	AUTHOR_TOKEN_ENV,
	NOT_CONFIGURED_ERROR,
} from "../../utils/author-token";

/**
 * How the author dashboards (/read/analytics) read what readers sent. On a
 * server deployment the read endpoints answer only a request with the author
 * token (BOOKKIT_AUTHOR_TOKEN), so the author enters it once in the
 * dashboard; it is kept in this browser's localStorage and sent as
 * `Authorization: Bearer`, never in a URL. Without it the dashboards show
 * this browser's own events, as they always have on a static site.
 */

export type TokenStorage = StorageLike & Pick<Storage, "removeItem">;

/** `window.localStorage`, looked up on each call so a blocked one is caught. */
export const deferredTokenStorage: TokenStorage = {
	...deferredLocalStorage,
	removeItem: (key) => window.localStorage.removeItem(key),
};

/** One key per book, as the dashboards' other stored data has. */
export const authorTokenKey = (bookKey: string): string =>
	`${bookKey}.author-token`;

export const readAuthorToken = (
	storage: TokenStorage,
	bookKey: string,
): string | null => readStoredValue(storage, authorTokenKey(bookKey)) || null;

/** Stores the token, trimmed; false when it is empty or the browser would not keep it. */
export const saveAuthorToken = (
	storage: TokenStorage,
	bookKey: string,
	token: string,
): boolean => {
	const trimmed = token.trim();
	if (!trimmed) return false;
	writeStoredValue(storage, authorTokenKey(bookKey), trimmed);
	return readAuthorToken(storage, bookKey) === trimmed;
};

export const forgetAuthorToken = (
	storage: TokenStorage,
	bookKey: string,
): void => {
	try {
		storage.removeItem(authorTokenKey(bookKey));
	} catch {
		// Storage is blocked, so nothing was stored either.
	}
};

/** The key the dashboards' other stored data uses (`data-analytics-key`). */
export const pageBookKey = (): string =>
	document.body?.dataset?.analyticsKey || "book";

/** The token the dashboards send, if the author saved one in this browser. */
export const storedAuthorToken = (): string | null =>
	readAuthorToken(deferredTokenStorage, pageBookKey());

/** What one read endpoint answered. */
export type AuthorReadState =
	/** It sent its data. */
	| "ok"
	/** It needs the token, and none is stored. */
	| "needs-token"
	/** It refused the stored token. */
	| "token-refused"
	/** The server has no usable BOOKKIT_AUTHOR_TOKEN, so it shows no one. */
	| "not-configured"
	/** Nothing there to ask (a static site's 404), or the request failed. */
	| "unavailable";

export type AuthorRead =
	| { state: "ok"; payload: unknown }
	| { state: Exclude<AuthorReadState, "ok"> };

export const fetchAuthorJson = async (
	url: string,
	{
		token,
		fetchImpl = fetch,
	}: { token: string | null; fetchImpl?: typeof fetch },
): Promise<AuthorRead> => {
	const headers: Record<string, string> = { Accept: "application/json" };
	if (token) headers.Authorization = `Bearer ${token}`;
	let response: Response;
	try {
		response = await fetchImpl(url, { headers });
	} catch {
		return { state: "unavailable" };
	}
	if (response.status === 401) {
		return { state: token ? "token-refused" : "needs-token" };
	}
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: unknown;
		} | null;
		return {
			state:
				response.status === 500 && body?.error === NOT_CONFIGURED_ERROR
					? "not-configured"
					: "unavailable",
		};
	}
	try {
		return { state: "ok", payload: await response.json() };
	} catch {
		return { state: "unavailable" };
	}
};

/** Each dashboard says what its endpoint answered; the access panel listens. */
export const AUTHOR_READ_EVENT = "bookkit:author-read";
/** The panel saved or forgot the token; the dashboards read again. */
export const AUTHOR_TOKEN_EVENT = "bookkit:author-token";

export type AuthorReadDetail = { source: string; state: AuthorReadState };

const latestReads = new Map<string, AuthorReadState>();

export const reportAuthorRead = (source: string, state: AuthorReadState) => {
	latestReads.set(source, state);
	window.dispatchEvent(
		new CustomEvent<AuthorReadDetail>(AUTHOR_READ_EVENT, {
			detail: { source, state },
		}),
	);
};

/** Reads reported before the panel started listening. */
export const reportedReads = (): ReadonlyMap<string, AuthorReadState> =>
	latestReads;

export const announceTokenChange = () =>
	window.dispatchEvent(new Event(AUTHOR_TOKEN_EVENT));

const LOCAL_ONLY =
	"Until then, the dashboards below show only this browser's own visits.";

export type AuthorAccessView = {
	/** The panel stays hidden: the server answered without a token (bookkit dev), or there is no server. */
	hidden: boolean;
	message: string;
	/** The token field and its save button. */
	askForToken: boolean;
	/** A token is stored, so it can be forgotten. */
	canForget: boolean;
};

/** What the access panel says, given what each endpoint answered. */
export const authorAccessView = (
	reads: Iterable<AuthorReadState>,
	hasToken: boolean,
): AuthorAccessView => {
	const states = new Set(reads);
	const hidden = { hidden: true, message: "", askForToken: false };
	if (states.has("token-refused")) {
		return {
			hidden: false,
			message: `The server refused the token saved in this browser. Enter the ${AUTHOR_TOKEN_ENV} set where the server runs now, or forget the saved one. ${LOCAL_ONLY}`,
			askForToken: true,
			canForget: hasToken,
		};
	}
	if (states.has("needs-token")) {
		return {
			hidden: false,
			message: `This server shows readers' analytics and feedback only to the author. Enter the ${AUTHOR_TOKEN_ENV} set where the server runs; this browser keeps it, and sends it only to this site. ${LOCAL_ONLY}`,
			askForToken: true,
			canForget: hasToken,
		};
	}
	if (states.has("not-configured")) {
		return {
			hidden: false,
			message: `This server has no ${AUTHOR_TOKEN_ENV}, so it shows readers' analytics and feedback to no one. Set it where the server runs, to 32 or more random characters (openssl rand -hex 32), and restart the server. The dashboards below show only this browser's own visits.`,
			askForToken: false,
			canForget: hasToken,
		};
	}
	if (hasToken && states.has("ok")) {
		return {
			hidden: false,
			message:
				"Showing what readers sent to the server, read with the author token saved in this browser.",
			askForToken: false,
			canForget: true,
		};
	}
	return { ...hidden, canForget: false };
};
