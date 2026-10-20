import {
	AUTHOR_READ_EVENT,
	type AuthorReadDetail,
	type AuthorReadState,
	announceTokenChange,
	authorAccessView,
	deferredTokenStorage,
	forgetAuthorToken,
	pageBookKey,
	reportedReads,
	saveAuthorToken,
	storedAuthorToken,
} from "./access";

const panel = document.querySelector<HTMLElement>("[data-author-access]");
const message = panel?.querySelector<HTMLElement>(
	"[data-author-access-message]",
);
const form = panel?.querySelector<HTMLFormElement>("[data-author-access-form]");
const input = panel?.querySelector<HTMLInputElement>(
	"[data-author-access-token]",
);
const forget = panel?.querySelector<HTMLButtonElement>(
	"[data-author-access-forget]",
);

if (panel && message && form && input && forget) {
	const bookKey = pageBookKey();
	const reads = new Map<string, AuthorReadState>(reportedReads());
	// Set from a save until the dashboards have asked the server again.
	let checking = false;

	const render = (note?: string) => {
		if (checking && reads.size === 0) {
			panel.hidden = false;
			message.textContent = "Asking the server again…";
			form.hidden = true;
			forget.hidden = true;
			return;
		}
		const view = authorAccessView(reads.values(), storedAuthorToken() !== null);
		panel.hidden = view.hidden && !note;
		message.textContent = note ?? view.message;
		form.hidden = !view.askForToken;
		forget.hidden = !view.canForget;
	};

	const readAgain = () => {
		reads.clear();
		announceTokenChange();
	};

	window.addEventListener(AUTHOR_READ_EVENT, (event) => {
		const { source, state } = (event as CustomEvent<AuthorReadDetail>).detail;
		reads.set(source, state);
		checking = false;
		render();
	});

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!saveAuthorToken(deferredTokenStorage, bookKey, input.value)) {
			render(
				"This browser would not store the token (its site data is blocked for this page), so the dashboards cannot send it. Allow site data for this site and save it again.",
			);
			return;
		}
		input.value = "";
		checking = true;
		readAgain();
		render();
	});

	forget.addEventListener("click", () => {
		forgetAuthorToken(deferredTokenStorage, bookKey);
		input.value = "";
		checking = true;
		readAgain();
		render();
	});

	render();
}
