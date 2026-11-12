import { CONTENT_SECTIONS } from "../../packages/astro-bookkit/src/validators/content-check";
import { formatUsage, type Usage } from "./cli";
import { DEFAULT_DEV_PORT } from "./dev-server";

/**
 * The `bookkit` commands: each one's name, the other names it answers to,
 * and the help `bookkit <command> --help` prints. scripts/bookkit.ts
 * dispatches on these names, so a command missing here has no help and no
 * suggestion when mistyped; scripts/lib/commands/help.test.ts runs `--help`
 * for every entry.
 */
export type BookkitCommand = {
	name: string;
	aliases?: readonly string[];
	/**
	 * Its help, or the script that prints it: a command that hands its
	 * arguments to one of scripts/ shows that script's own help.
	 */
	help: Usage | { script: string };
	/** Kinds with help of their own, such as `new chapter`. */
	subcommands?: readonly BookkitCommand[];
};

const BOOK = [
	"[book]",
	"The book (default: the current one, set with use)",
] as const;

const NEW_BOOK_HELP: Usage = {
	summary:
		"Creates a book app in apps/<slug> from the engine's starter, runs bun\ninstall, and makes it the current book. --from imports a folder of\nnotes into it as chapters, without the starter's placeholder content.",
	usage: [
		'bun run bookkit new book <slug> [--title "<title>"] [--frame <slug>] [--from <folder>]',
	],
	options: [
		["<slug>", "The book's slug: lowercase words joined by hyphens"],
		[
			'--title "<title>"',
			"Its title (default: from the slug; asked at a terminal)",
		],
		[
			"--frame <slug>",
			"intervention (default), explainer, field-guide, or runbook",
		],
		["--from <folder>", "A folder of Markdown notes to import"],
		["--skip-starter-content", "Leave the content folders empty"],
		["--no-install", "Skip bun install"],
	],
	examples: [
		'bun run bookkit new book field-notes --title "Field Notes"',
		"bun run bookkit new book pager-notes --frame runbook --from ~/notes/runbooks",
	],
};

const NEW_KINDS: readonly BookkitCommand[] = [
	{
		name: "chapter",
		help: {
			summary:
				"Starts the next numbered chapter of a book as a draft, listing the\nbook's mechanisms in `mechanisms:` for you to keep or remove.",
			usage: [
				'bun run bookkit new chapter [book] "<title>" [--after <chapter>]',
			],
			options: [
				BOOK,
				[
					'"<title>"',
					"The chapter's title; its slug and file name come from it",
				],
				[
					"--after <chapter>",
					"Put it after that chapter (its slug, file name, or\nnumber), renumbering the files after it",
				],
			],
			notes:
				"Writes apps/<book>/src/content/book/chapters/<number>-<slug>.mdx. At a\nterminal, a missing title is asked for.",
			examples: [
				'bun run bookkit new chapter "Repair has a clock"',
				'bun run bookkit new chapter on-call "Handoffs" --after triage-and-escalation',
			],
		},
	},
	{
		name: "mechanism",
		help: {
			summary:
				"Names a new mechanism. It first looks in every book for one with the\nsame slug or similar wording, then writes a draft.",
			usage: [
				'bun run bookkit new mechanism [book] "<title>" [--definition "<one sentence>"] [--force]',
			],
			options: [
				BOOK,
				['"<title>"', "Its title; the slug comes from it"],
				['--definition "<sentence>"', "What it is, in one sentence"],
				["--force", "Write it even when similar mechanisms exist"],
			],
			notes:
				"When similar mechanisms exist in the book's corpus, it lists them and\nstops (at a terminal, it asks). If one fits, bind its slug in the\nchapter instead.",
			examples: [
				'bun run bookkit new mechanism bad-people "Waiting as leverage"',
				'bun run bookkit new mechanism "Waiting as leverage" --definition "Delay used to force a concession."',
			],
		},
	},
	{
		name: "tool",
		help: {
			summary:
				"Starts a toolkit action for one of the book's mechanisms: something a\nreader can do in 10 minutes or less.",
			usage: ['bun run bookkit new tool [book] <mechanism-slug> "<name>"'],
			options: [
				BOOK,
				[
					"<mechanism-slug>",
					"The mechanism it responds to (at a terminal, picked\nfrom a list)",
				],
				['"<name>"', "The action's name"],
			],
			examples: [
				'bun run bookkit new tool on-call incident-triage "Name the incident owner"',
			],
		},
	},
	{
		name: "example",
		help: {
			summary:
				"Starts an example of a mechanism: a replaceable illustration, grouped\nby the domain it happens in.",
			usage: [
				'bun run bookkit new example [book] <mechanism-slug> <domain> "<title>"',
			],
			options: [
				BOOK,
				["<mechanism-slug>", "The mechanism it illustrates"],
				["<domain>", "The setting it happens in, such as Housing or Workplace"],
				['"<title>"', "The example's title"],
			],
			examples: [
				'bun run bookkit new example bad-people delay-as-force Housing "The repair request"',
			],
		},
	},
	{
		name: "glossary",
		help: {
			summary:
				"Starts a glossary entry: a term readers meet, with its definition.",
			usage: [
				'bun run bookkit new glossary [book] "<term>" [--definition "<one sentence>"] [--mechanism <slug>]',
			],
			options: [
				BOOK,
				['"<term>"', "The term; its slug and file name come from it"],
				['--definition "<sentence>"', "What it means, in one sentence"],
				["--mechanism <slug>", "A mechanism the term names"],
			],
			notes:
				"Writes apps/<book>/src/content/book/glossary/<slug>.mdx. Link the term\nwhere a chapter first uses it; bookkit check lists first uses that are\nnot linked.",
			examples: [
				'bun run bookkit new glossary "Pager queue" --definition "Alerts waiting for an owner."',
			],
		},
	},
	{
		name: "release",
		help: {
			summary:
				"Starts a dated release note for the book, numbered the next minor\nversion unless --version says otherwise.",
			usage: [
				'bun run bookkit new release [book] "<title>" [--version <x.y.z>]',
			],
			options: [
				BOOK,
				['"<title>"', "What the release is called"],
				["--version <x.y.z>", "Its version, such as 1.2.0"],
			],
			notes:
				"Writes apps/<book>/src/content/book/releases/<date>-<slug>.mdx; the\nrelease notes page lists it.",
			examples: [
				'bun run bookkit new release "Second printing"',
				'bun run bookkit new release on-call "Drills chapter" --version 1.1.0',
			],
		},
	},
	{
		name: "book",
		help: NEW_BOOK_HELP,
	},
];

export const BOOKKIT_COMMANDS: readonly BookkitCommand[] = [
	{
		name: "status",
		help: {
			summary:
				"Lists your books (chapters, stubs, mechanisms, tools), then the\ncommands to write, check, preview, build, and deploy one. Running\nbookkit with no command does this.",
			usage: ["bun run bookkit [status] [book] [--json]"],
			options: [
				[
					"[book]",
					"The book whose commands to show (default: the current one)",
				],
				["--json", "Every book's summary as JSON"],
			],
			examples: [
				"bun run bookkit",
				"bun run bookkit status on-call",
				"bun run bookkit status --json",
			],
		},
	},
	{
		name: "map",
		help: {
			summary:
				"A grid of a book's mechanisms by chapter: which chapters list which\nmechanisms in mechanisms:, which chapters list none (with their words,\nso a drafted chapter that binds nothing stands out), the mechanisms no\nchapter binds, and the ones shared with other books of the corpus.",
			usage: ["bun run bookkit map [book] [--json]"],
			options: [BOOK, ["--json", "The map as JSON"]],
			examples: [
				"bun run bookkit map running-hot",
				"bun run bookkit map --json",
			],
		},
	},
	{
		name: "use",
		help: {
			summary:
				"Sets the book you are working on. Commands that take a book default to\nit. It is kept in .bookkit/local.json, which git ignores.",
			usage: ["bun run bookkit use [book]", "bun run bookkit use --clear"],
			options: [
				["[book]", "The book to work on; with none, says which one is current"],
				["--clear", "Have no current book"],
			],
			examples: [
				"bun run bookkit use running-hot",
				"bun run bookkit use --clear",
			],
		},
	},
	{
		name: "new",
		help: {
			summary:
				"Starts a chapter, mechanism, tool, example, release note, or book. With\nno kind, asks which (at a terminal).",
			// Each kind's own first form, so the list cannot drift from them.
			usage: NEW_KINDS.flatMap((kind) =>
				"script" in kind.help ? [] : kind.help.usage,
			),
			notes:
				"bun run bookkit new <kind> --help shows each kind's arguments. [book]\ndefaults to the current one, and at a terminal anything left out is\nasked for.",
			examples: [
				"bun run bookkit new",
				'bun run bookkit new chapter "Repair has a clock"',
				"bun run bookkit new mechanism --help",
			],
		},
		subcommands: NEW_KINDS,
	},
	{
		name: "try",
		help: {
			summary:
				"Shows what Bookkit would make of any folder of Markdown: the frame it\nreads as, how many documents carry each step, the ideas that recur, and\nthe links and markup import would change. Reads only; writes nothing.",
			usage: ["bun run bookkit try <folder> [--frame <slug>] [--json]"],
			options: [
				["<folder>", "A folder of Markdown notes, anywhere"],
				[
					"--frame <slug>",
					"Read it as this frame: intervention, explainer,\nfield-guide, or runbook",
				],
				["--json", "The preview as JSON"],
			],
			examples: [
				"bun run bookkit try ~/notes/runbooks",
				"bun run bookkit try ./docs --frame field-guide --json",
			],
		},
	},
	{
		name: "check",
		help: {
			summary:
				"Checks a book: its structure, mechanisms that overlap across books,\nand (advisory) suggestions. Or one content file, with each finding's\nfield and fix. Or any Markdown where it is, without making it a book.",
			usage: [
				"bun run bookkit check [book] [--all] [--quick] [--info] [--download-model]",
				"bun run bookkit check <file.mdx> [--json] [--quick]",
				"bun run bookkit check <book folder> [--json]",
				"bun run bookkit check <folder|file> [--frame <slug>] [--json] [--release]",
			],
			options: [
				[
					"[book]",
					"The book (default: the current one; with none, every book)",
				],
				["--all", "Every book, even when a current book is set"],
				[
					"--quick",
					"Compare mechanisms by wording only, without the 550 MB\nembedding model",
				],
				["--download-model", "Download the model without asking"],
				["--info", "Also the info-level suggestions"],
				[
					"<file.mdx>",
					"One content file of a book (or a release note), with the\nbook's suggestions about it",
				],
				[
					"<book folder>",
					"A folder of a book's content, with the book's rules",
				],
				["<folder|file>", "Markdown outside a book: the content contract"],
				["--frame <slug>", "Also each step of this frame, in every document"],
				["--release", "Check it as a published book, so drafts are errors"],
				["--json", "The findings as JSON"],
			],
			notes: "Exits 1 on an error, so CI can run it.",
			examples: [
				"bun run bookkit check running-hot",
				"bun run bookkit check --all --quick",
				"bun run bookkit check apps/on-call/src/content/book/chapters/00-overview.mdx",
				"bun run bookkit check ./runbooks --frame runbook",
			],
		},
	},
	{
		name: "contract",
		help: {
			summary:
				"Prints the fields each content section needs, what each one means, and\na file that compiles.",
			usage: ["bun run bookkit contract [section] [--json]"],
			options: [
				[
					"[section]",
					`One of: ${CONTENT_SECTIONS.join(", ")}, or release (default:\nevery content section)`,
				],
				["--json", "The contracts as JSON"],
			],
			examples: [
				"bun run bookkit contract",
				"bun run bookkit contract mechanism --json",
				"bun run bookkit contract release",
			],
		},
	},
	{ name: "verify", help: { script: "verify.ts" } },
	{
		name: "validate",
		help: {
			summary:
				"Checks structure only: each content file's contract, the frame, slugs\nused twice, and the rules the book's status sets. bookkit check adds\nthe mechanism checks.",
			usage: ["bun run bookkit validate [book] [--all] [--json]"],
			options: [
				[
					"[book]",
					"The book (default: the current one; with none, every book)",
				],
				["--all", "Every book, even when a current book is set"],
				["--json", "One book's findings as JSON"],
			],
			examples: [
				"bun run bookkit validate",
				"bun run bookkit validate --all",
				"bun run bookkit validate on-call --json",
			],
		},
	},
	{
		name: "triage",
		help: {
			summary:
				"Diagnoses real-world symptoms and operational incidents against the\nmechanism corpus, generates a discriminating question between top candidates,\nand provides an executable <= 10-minute runbook action.",
			usage: [
				'bun run bookkit triage "<incident or symptom description>" [book] [--semantic] [--json]',
			],
			options: [
				[
					'"<incident description>"',
					"The symptom, failure mode, or observed friction",
				],
				BOOK,
				["--semantic", "Rank by meaning using embedding similarity"],
				["--json", "Output the diagnostic result and runbook action as JSON"],
			],
			examples: [
				'bun run bookkit triage "pager alert sev-1 deploy failing" on-call',
				'bun run bookkit triage "payroll withholding dispute and w4 question" match-to-july',
				'bun run bookkit triage "handoff reset and queue delay" --json',
			],
		},
	},
	{
		name: "redteam",
		help: {
			summary:
				"Adversarially simulates institutional bureaucracy and defensive evasion\nagainst a tool's action steps, identifying vulnerabilities and producing\nhardened additions for failureLooksLike and legitimateDemand.",
			usage: ["bun run bookkit redteam <tool> [book] [--json]"],
			options: [
				["<tool>", "The slug or name of the tool to red-team"],
				BOOK,
				[
					"--json",
					"Output the adversarial report and hardened additions as JSON",
				],
			],
			examples: [
				"bun run bookkit redteam check-the-w4 match-to-july",
				"bun run bookkit redteam ramp-escalation on-call",
				"bun run bookkit redteam ramp-escalation --json",
			],
		},
	},
	{
		name: "probe",
		help: {
			summary:
				"Active learning boundary probe that generates synthetic edge-case vignettes\nbetween two mechanisms to locate semantic ambiguity and sharpen definitions.",
			usage: ["bun run bookkit probe <slugA> <slugB> [book] [--json]"],
			options: [
				["<slugA>", "First mechanism slug"],
				["<slugB>", "Second mechanism slug"],
				BOOK,
				[
					"--json",
					"Output boundary vignettes and sharpening recommendations as JSON",
				],
			],
			examples: [
				"bun run bookkit probe bounded-escalation incident-triage on-call",
				"bun run bookkit probe attrition-by-queue documentation-tollbooth running-hot",
				"bun run bookkit probe bounded-escalation incident-triage --json",
			],
		},
	},
	{
		name: "similar",
		help: {
			summary:
				"Lists existing mechanisms, in any book, that a new one might\nduplicate. Reads only.",
			usage: [
				'bun run bookkit similar "<title>" [--definition "<one sentence>"] [--semantic] [--json]',
			],
			options: [
				['"<title>"', "The new mechanism's title"],
				['--definition "<sentence>"', "Its definition, compared too"],
				[
					"--semantic",
					"Rank by meaning with check:corpus's model (by wording\nwhen the model cannot load)",
				],
				["--json", "The matches as JSON"],
			],
			examples: [
				'bun run bookkit similar "Waiting as leverage"',
				'bun run bookkit similar "Waiting as leverage" --definition "Delay used to force a concession." --semantic',
			],
		},
	},
	{
		name: "judge",
		help: {
			summary:
				"Asks judges, blind, whether close mechanisms are the same idea. Writes a\nprompt per judge in .bookkit/judging/. With a judge command, asks each\none and records the answers in corpus-judgments.json.",
			usage: [
				'bun run bookkit judge [mechanism] [--judges <n>] [--judge-top <n>] [--run "<command>"]',
				'bun run bookkit judge --rulings [--judges <n>] [--run "<command>"]',
				'bun run bookkit judge run [folder] [--run "<command>"]',
				"bun run bookkit judge record [folder]",
			],
			options: [
				[
					"[mechanism]",
					"One mechanism's 3 nearest without a verdict (default:\nthe corpus's flagged and closest pairs)",
				],
				[
					"--rulings",
					"Ask about your ruled pairs instead, so check:corpus\n--eval can score a new panel against your rulings",
				],
				["--judges <n>", "Judges per pair (default: 3)"],
				["--judge-top <n>", "How many pairs to ask about (default: 10)"],
				[
					'--run "<command>"',
					"A command that reads a prompt on stdin and prints the\nreply; or set BOOKKIT_JUDGE_COMMAND (one per line).\nGiven more than once, the judges are asked in turn",
				],
				["--no-run", "Write the prompts only"],
				["--quick", "Find the nearest by wording, without the model"],
				["--download-model", "Download the model without asking"],
				[
					"run [folder]",
					"Ask the judges that have not answered (default: the\nnewest request)",
				],
				[
					"record [folder]",
					"Record answers saved by hand as answer-<n>.json\n(default: the newest request with answers)",
				],
			],
			examples: [
				"bun run bookkit judge delay-as-force",
				'bun run bookkit judge --run "<your LLM\'s command-line tool>"',
				"bun run bookkit judge record",
				'bun run bookkit judge --rulings --run "claude -p" --run "ollama run <model>"',
			],
		},
	},
	{
		name: "define",
		help: {
			summary:
				"Has a writer model draft a mechanism's empty fields (its definition, is,\nisNot, predictions, and tests) from the sentences of the book that use\nit. Shows the proposal; --apply writes it into the empty fields, only\nwhen it passes the check and reads like no mechanism in any book.",
			usage: [
				'bun run bookkit define [book] <mechanism> [--writer "<command>"] [--apply] [--no-run]',
			],
			options: [
				BOOK,
				["<mechanism>", "The mechanism's slug: one with no definition yet"],
				[
					'--writer "<command>"',
					"A command that reads a prompt on stdin and prints the\nreply; or set BOOKKIT_DRAFT_COMMAND",
				],
				[
					"--apply",
					"Write the proposal last shown (or, with none, a new one)\ninto the empty fields; a field you wrote is never replaced",
				],
				["--no-run", "Write the prompt only"],
			],
			notes:
				"The prompt, the reply, and the proposal are in .bookkit/defining/,\nwhich git ignores. A definition that scores 0.5 or more by wording\nagainst another mechanism is not written: merge the two, or write the\nboundary yourself and ask judges (bookkit judge).",
			examples: [
				"bun run bookkit propose my-book --apply mechanisms",
				'bun run bookkit define my-book context-debt --writer "ollama run <model> --think=false"',
				"bun run bookkit define my-book context-debt --apply",
			],
		},
	},
	{
		name: "finish",
		help: {
			summary:
				"Takes model-drafted chapters the last mile. Each round reviews the chapter,\nhands the findings and the check's warnings to writer models as a revision,\nand has blind judges choose between the revisions and the chapter as it was.\nIt stops when a review finds nothing, no revision beats the chapter, the\nfindings stop falling, or after --rounds. It never rewrites a chapter you\nedited since draft apply, unless --include-edited.",
			usage: [
				'bun run bookkit finish [book] [chapter] [--rounds <n>] [--writer "<command>"] [--judge "<command>"] [--include-edited]',
			],
			options: [
				BOOK,
				[
					"[chapter]",
					"One chapter (default: every chapter that still holds a\ndraft as draft apply wrote it)",
				],
				["--rounds <n>", "Revisions at most per chapter (default: 3)"],
				[
					'--writer "<command>"',
					"The writers; or set BOOKKIT_DRAFT_COMMAND (one per line)",
				],
				[
					'--judge "<command>"',
					"The reviewers and judges; or set BOOKKIT_JUDGE_COMMAND",
				],
				["--reviewers <n>", "Reviewers each round (default: 1)"],
				["--judges <n>", "Judges each round (default: 3)"],
				["--candidates <n>", "Revisions each round (default: 2)"],
				["--parallel <n>", "Writers asked at once (default: 1)"],
				["--timeout <seconds>", "How long one writer may take (default: 300)"],
				[
					"--include-edited",
					"Also revise chapters you have edited, or wrote yourself",
				],
			],
			notes:
				"Each round is a review under .bookkit/reviewing/ and a request under\n.bookkit/drafting/, so bookkit draft results counts its writers and judges.\nThe last line per chapter gives its findings by round (11 → 6 → 2).",
			examples: [
				'bun run bookkit finish running-hot --writer "ollama run <model> --think=false" --judge "claude -p"',
				"bun run bookkit finish running-hot the-hot-potato --rounds 2",
			],
		},
	},
	{
		name: "review",
		help: {
			summary:
				"Has judge models read a written chapter against the rules a draft is\nheld to and the contracts of the mechanisms it binds, and say what they\nwould change. For a chapter you wrote, or edited after a draft. It is\nadvice: it never edits the chapter, and bookkit check decides whether\nthe chapter passes.",
			usage: [
				'bun run bookkit review [book] <chapter|file.mdx> [--judges <n>] [--judge "<command>"] [--no-run] [--json]',
			],
			options: [
				BOOK,
				[
					"<chapter|file.mdx>",
					"The chapter: its slug, file name, number, or path",
				],
				["--judges <n>", "Reviewers to ask, each on its own (default: 1)"],
				[
					'--judge "<command>"',
					"A command that reads a prompt on stdin and prints the\nreply; or set BOOKKIT_JUDGE_COMMAND. Given more than\nonce, the reviewers are asked in turn",
				],
				["--no-run", "Write the prompt only"],
				["--json", "Every reviewer's findings, as JSON"],
			],
			notes:
				"Each review is a folder under .bookkit/reviewing/, which git ignores:\nthe prompt, each reviewer's reply, and review.json.",
			examples: [
				'bun run bookkit review running-hot the-hot-potato --judge "claude -p"',
				"bun run bookkit review apps/running-hot/src/content/book/chapters/14-justice-is-who-pays-for-stability.mdx --judges 3",
			],
		},
	},
	{
		name: "draft",
		help: {
			summary:
				"Drafts a stub chapter with models, in three steps. Writer commands each\nwrite a candidate from one brief. The compiler checks each candidate as\nthe chapter it would replace. Judge commands, blind to who wrote which,\nrank the ones that pass and reject any that break the brief. Nothing\nreaches the chapter until draft apply.",
			usage: [
				'bun run bookkit draft [book] <chapter> [--candidates <n>] [--judges <n>] [--writer "<command>"] [--judge "<command>"] [--notes <path>] [--apply]',
				"bun run bookkit draft [book] --stubs [the same options]",
				"bun run bookkit draft resume [folder] [--apply]",
				"bun run bookkit draft apply [folder] [--pick <candidate>]",
				"bun run bookkit draft revise [folder] [--candidates <n>] [--apply]",
				"bun run bookkit draft results",
			],
			options: [
				BOOK,
				["<chapter>", "The stub: its slug, file name, or number"],
				["--stubs", "Every stub of the book, in reading order"],
				["--candidates <n>", "Drafts to ask for (default: 3)"],
				["--judges <n>", "Judges to ask (default: 3)"],
				[
					'--writer "<command>"',
					"A command that reads a prompt on stdin and prints the\nreply; or set BOOKKIT_DRAFT_COMMAND (one per line).\nGiven more than once, the candidates are written in turn",
				],
				[
					'--judge "<command>"',
					"The same, for the judges; or set BOOKKIT_JUDGE_COMMAND",
				],
				[
					"--notes <path>",
					"Your own source text for the chapter, a file or a\nfolder, put in the brief; may be given more than once",
				],
				[
					"--words <n>",
					"The length to aim for (default: the book's drafted\nchapters' median, and at least twice the stub threshold)",
				],
				[
					"--parallel <n>",
					"Writers asked at once (default: 1, each command's\ncandidates together: local models share one server)",
				],
				["--timeout <seconds>", "How long one writer may take (default: 300)"],
				["--redraft", "Draft a chapter that is past the stub threshold"],
				[
					"--apply",
					"Write the winner into the chapter when the judges agree\non one",
				],
				["--no-run", "Write the brief and the prompts; ask no one"],
				[
					"resume [folder]",
					"Ask the writers and judges that have not answered,\nthen make the call (default: the newest request)",
				],
				[
					"apply [folder]",
					"Write the winner into the chapter (default: the newest\nrequest with a call); --pick <candidate> names another",
				],
				[
					"revise [folder]",
					"Have the writers make the changes the judges named in\nthe winner (default: the newest request with one), then\njudge the revisions against it; --candidates sets how\nmany (default: 2)",
				],
				["results", "Each writer's and each judge's record so far"],
			],
			notes:
				"A request is a folder under .bookkit/drafting/, which git ignores. A\ndraft changes the chapter's body, mechanisms:, and summary:; its slug,\ntitle, status, and prerequisites stay the stub's. Without a command,\nsave a writer's reply as candidate-<n>.mdx or a judge's as\nballot-<n>.json in the request folder, then run draft resume.",
			examples: [
				'bun run bookkit draft running-hot the-hot-potato --writer "ollama run <model> --think=false" --judge "claude -p"',
				"bun run bookkit draft running-hot --stubs --notes ~/notes/running-hot",
				"bun run bookkit draft apply",
				"bun run bookkit draft results",
			],
		},
	},
	{
		name: "rule",
		help: {
			summary:
				"Rules two mechanisms of one corpus different ideas, with your reason,\nin corpus.json, so the corpus check stops flagging the pair.",
			usage: [
				'bun run bookkit rule <mechanism> <mechanism> --distinct "<reason>"',
			],
			options: [
				["<mechanism> <mechanism>", "Two mechanism slugs"],
				[
					'--distinct "<reason>"',
					"What each one's lever is, so a reader can tell them\napart",
				],
			],
			notes: "To rule them one idea instead: bun run bookkit merge.",
			examples: [
				'bun run bookkit rule <a> <b> --distinct "<a> works by …; <b> works by …"',
			],
		},
	},
	{
		name: "merge",
		help: {
			summary:
				"Rules two mechanisms one idea: <drop> becomes <keep> in every book of\ntheir corpus (contract, files, links, config), and corpus.json records\nthe merge with both mechanisms as they were.",
			usage: [
				'bun run bookkit merge <keep> <drop> --reason "<why they are one idea>" [--definition "<one sentence>"] [--dry-run]',
			],
			options: [
				["<keep>", "The mechanism that stays"],
				["<drop>", "The mechanism folded into it"],
				[
					'--reason "<why>"',
					"The lever and the evidence they share, in your words",
				],
				[
					'--definition "<sentence>"',
					"The merged contract's definition (default: <keep>'s)",
				],
				["--dry-run", "List the changes; write nothing"],
			],
			examples: [
				'bun run bookkit merge <keep> <drop> --reason "<why>" --dry-run',
			],
		},
	},
	{
		name: "sync",
		help: {
			summary:
				"Copies one copy of a mechanism's contract to its other books in the\ncorpus, so every copy reads the same.",
			usage: [
				"bun run bookkit sync <mechanism> [--from <book>] [--to <book>] [--dry-run]",
			],
			options: [
				["<mechanism>", "The mechanism's slug"],
				["--from <book>", "The copy to keep (default: the one edited last)"],
				["--to <book>", "Share it with a book that has no copy yet"],
				["--dry-run", "List the changes; write nothing"],
			],
			examples: [
				"bun run bookkit sync delay-as-force --dry-run",
				"bun run bookkit sync delay-as-force --from bad-people",
				"bun run bookkit sync delay-as-force --to on-call",
			],
		},
	},
	{
		name: "rename",
		help: {
			summary:
				"Renames a chapter's slug, and with it the file name, other chapters'\nprerequisites, and links to it. Or a mechanism's slug, in every book of\nits corpus, with everything that names it.",
			usage: [
				'bun run bookkit rename chapter [book] <slug> <new-slug> [--title "<title>"] [--dry-run]',
				'bun run bookkit rename mechanism [book] <slug> <new-slug> [--title "<title>"] [--dry-run]',
			],
			options: [
				["[book]", "The book (default: the current one, or the only one)"],
				["<slug> <new-slug>", "The slug, and the one it gets"],
				['--title "<title>"', "A new title as well"],
				["--dry-run", "List the changes; write nothing"],
			],
			notes:
				"A mechanism's rename moves its file, glossary entry, and examples, and\nrebinds chapters, actions, links, and config; corpus.json records the\nold slug. Its old page, /read/mechanisms/<slug>, is gone.",
			examples: [
				"bun run bookkit rename chapter on-call drills practice-drills --dry-run",
				'bun run bookkit rename mechanism delay-as-force waiting-as-leverage --title "Waiting as leverage" --dry-run',
			],
		},
	},
	{
		name: "dev",
		aliases: ["preview", "serve", "start"],
		help: {
			summary: `Previews a book at http://localhost:${DEFAULT_DEV_PORT}/ with live reload, until stopped.\nstop, status, and logs find a dev server that bookkit dev or astro dev\nleft running.`,
			usage: [
				"bun run bookkit dev [book] [--port <n>]",
				"bun run bookkit dev stop|status|logs [book]",
			],
			options: [
				["[book]", "The book (default: the current one; at a terminal, asks)"],
				["--port <n>", `The port (default: ${DEFAULT_DEV_PORT})`],
				["stop", "Stop the book's dev server"],
				["status", "Say whether one is running, and where"],
				["logs", "Show the log of one that moved to the background"],
			],
			examples: [
				"bun run bookkit dev running-hot",
				"bun run bookkit dev on-call --port 4400",
				"bun run bookkit dev stop on-call",
			],
		},
	},
	{
		name: "build",
		help: {
			summary: "Builds a book's site, PDF, and EPUB into apps/<book>/dist.",
			usage: ["bun run bookkit build [book] [--all]"],
			options: [
				[
					"[book]",
					"The book (default: the current one; with none, every book)",
				],
				["--all", "Every book, even when a current book is set"],
			],
			examples: [
				"bun run bookkit build on-call",
				"bun run bookkit build --all",
			],
		},
	},
	{
		name: "export",
		help: {
			summary:
				"Writes a GitBook folder of a book, and says where the last build put\nits PDF and EPUB. With --rubric, writes the book's corpus as an eval\nrubric instead: one criterion per mechanism, and your rulings as\nlabelled pairs.",
			usage: [
				"bun run bookkit export [book] [--out <dir>]",
				"bun run bookkit export [book] --rubric [--out <file>]",
			],
			options: [
				BOOK,
				[
					"--out <dir>",
					"Where to write it (default: apps/<book>/exports/gitbook;\nwith --rubric, apps/<book>/exports/rubric.json)",
				],
				["--rubric", "The corpus as an eval rubric, as JSON"],
			],
			examples: [
				"bun run bookkit export on-call",
				"bun run bookkit export on-call --out ../on-call-gitbook",
				"bun run bookkit export running-hot --rubric",
			],
		},
	},
	{
		name: "remove",
		help: {
			summary:
				"Removes a chapter, mechanism, or tool, and the entries that name it\n(other chapters' prerequisites, mechanisms: lists), listing the lines\nthat still mention it. remove book deletes a book app.",
			usage: [
				"bun run bookkit remove chapter|mechanism|tool [book] <slug> [--dry-run] [--with-records]",
				"bun run bookkit remove book <slug> [--dry-run]",
			],
			options: [
				BOOK,
				["<slug>", "The record's slug (a tool's file name works too)"],
				["--dry-run", "List the changes; write nothing"],
				[
					"--with-records",
					"For a mechanism: remove its tools and examples too",
				],
			],
			examples: [
				"bun run bookkit remove chapter on-call drills --dry-run",
				"bun run bookkit remove mechanism on-call bounded-escalation --with-records --dry-run",
			],
		},
	},
	{
		name: "move",
		help: {
			summary:
				"Binds a tool to another mechanism. Its slug and URL stay as they are.",
			usage: [
				"bun run bookkit move tool [book] <tool> --to <mechanism> [--dry-run]",
			],
			options: [
				BOOK,
				["<tool>", "The tool's slug or file name"],
				["--to <mechanism>", "The mechanism it binds to"],
				["--dry-run", "Show the change; write nothing"],
			],
			examples: [
				"bun run bookkit move tool on-call identify-rollback-candidate --to bounded-escalation",
			],
		},
	},
	{
		name: "publish",
		help: {
			summary:
				'Moves a book from draft to published: checks it with the rules a\npublished book is held to, then sets status: "published" in\nbook.config.ts. Nothing changes while an error stands.',
			usage: ["bun run bookkit publish [book] [--dry-run] [--records]"],
			options: [
				BOOK,
				["--dry-run", "Check only; change nothing"],
				[
					"--records",
					"Mark the book's draft records published first (put\nback if the book still fails)",
				],
			],
			notes:
				"It puts nothing online; bun run bookkit deploy does, once it is published.",
			examples: [
				"bun run bookkit publish on-call --dry-run",
				"bun run bookkit publish on-call --records",
			],
		},
	},
	{ name: "deploy", help: { script: "deploy.ts" } },
	{
		name: "import",
		aliases: ["import-book", "book:import"],
		help: { script: "import-book-from-markdown.ts" },
	},
	{
		name: "propose",
		aliases: ["proposal", "propose-book"],
		help: { script: "propose-book.ts" },
	},
	{
		name: "list",
		aliases: ["list:books"],
		help: {
			summary: "Lists the books in apps/.",
			usage: ["bun run bookkit list"],
			examples: ["bun run bookkit list"],
		},
	},
	{
		name: "init",
		aliases: ["create"],
		help: NEW_BOOK_HELP,
	},
	{
		name: "new-book",
		aliases: ["book:new", "book:add", "add-book"],
		help: { script: "scaffold-book.ts" },
	},
	{
		name: "remove-book",
		aliases: ["book:remove"],
		help: { script: "remove-book.ts" },
	},
	{
		name: "bets",
		help: {
			summary:
				"The maintainers' active bet (docs/bets.md), measured from git history.",
			usage: ["bun run bookkit bets [--json]"],
			options: [["--json", "The measure as JSON"]],
			examples: ["bun run bookkit bets"],
		},
	},
	{
		name: "help",
		help: {
			summary: "Lists every command, or prints one command's help.",
			usage: ["bun run bookkit help [command]"],
			options: [["[command]", "A command, such as check or new chapter"]],
			examples: ["bun run bookkit help", "bun run bookkit help new chapter"],
		},
	},
];

/** The command a name or alias stands for. */
export const findCommand = (name: string): BookkitCommand | undefined =>
	BOOKKIT_COMMANDS.find(
		(command) => command.name === name || command.aliases?.includes(name),
	);

/** Every name a command answers to, for "did you mean". */
export const commandNames = (): string[] =>
	BOOKKIT_COMMANDS.flatMap((command) => [
		command.name,
		...(command.aliases ?? []),
	]);

/**
 * The help for `bookkit <words>`: the deepest command the words name (`new
 * chapter`, else `new`), as text, or the script that prints it. Undefined
 * when the first word is no command.
 */
export const commandHelp = (
	words: readonly string[],
): { text: string } | { script: string } | undefined => {
	const command = findCommand(words[0] ?? "");
	if (!command) return undefined;
	const kind = command.subcommands?.find(
		(subcommand) => subcommand.name === words[1],
	);
	const { help } = kind ?? command;
	return "script" in help ? help : { text: formatUsage(help) };
};
