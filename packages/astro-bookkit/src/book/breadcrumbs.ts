export const readRoutePrefixFromPathname = (pathname: string): string => {
	const readPathIndex = pathname.indexOf("/read/");

	if (readPathIndex >= 0) {
		return pathname.slice(0, readPathIndex);
	}

	if (pathname.endsWith("/read")) {
		return pathname.slice(0, -"/read".length);
	}

	return "";
};

export const buildLocalizedReadRoutePath = (
	pathname: string,
	readRoutePath: string,
): string => `${readRoutePrefixFromPathname(pathname)}${readRoutePath}`;
