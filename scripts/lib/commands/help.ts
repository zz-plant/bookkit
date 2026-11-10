import { commandHelp, commandNames } from "../bookkit-commands";
import { didYouMean } from "../cli";
import { runScript } from "./context";

/** `bookkit help` and `--help`: every command, or one command's own help. */

/** A command's help, for an error that ends with it. */
export function usageOf(name: string): string {
	const help = commandHelp([name]);
	return help && "text" in help ? help.text : "";
}

/**
 * Prints the help of the command `words` name (and exits): its own, or, for
 * a command that hands its arguments to a script, the script's.
 */
export function printHelpFor(words: string[]): never {
	const help = commandHelp(words);
	if (!help) {
		console.error(
			`Unknown command "${words[0]}".${didYouMean(words[0], commandNames())} Run bun run bookkit help for every command.`,
		);
		process.exit(1);
	}
	if ("script" in help) process.exit(runScript(help.script, ["--help"]));
	console.log(help.text);
	process.exit(0);
}

export function printHelp() {
	console.log(`Bookkit — write, check, preview, and publish books

Usage: bun run bookkit <command>       (no command: your books, and the commands to write, check,
                                       preview, build, and deploy one)

Start
  try <folder> [--frame <slug>] [--json]    what Bookkit would make of any folder of Markdown (writes nothing)
  use [book]                                pick the book you're working on; [book] below defaults to it
  new                                       asks what to start, then anything it needs
  init [slug] [--from <folder>]             a new book (same as new book)

Write
  new chapter [book] "<title>" [--after <chapter>]
                                            start the next chapter as a draft; --after puts it after
                                            that chapter (its slug, or its number: --after 3)
  new mechanism [book] "<title>" [--definition "…"]
                                            name a mechanism, after checking every book for one that fits
  new tool [book] <mechanism> "<name>"      a ≤10-minute action for a mechanism
  new example [book] <mechanism> <domain> "<title>"
  new glossary [book] "<term>" [--definition "…"] [--mechanism <slug>]
                                            a glossary entry: a term readers meet
  new book <slug> [--from <folder>] [--frame <slug>]
                                            a new book app; --from imports a folder of notes into it
  import [book] --dir <path> [--dry-run]    turn a folder of Markdown notes into chapters; --dry-run shows the plan
  new release [book] "<title>"              a dated release note, the next version unless --version
  rename chapter [book] <slug> <new-slug> [--title "…"]
                                            a chapter's slug, file, prerequisites, and links, together
  rename mechanism [book] <slug> <new-slug> [--title "…"]
                                            a mechanism's slug in every book of its corpus, with every
                                            reference to it; corpus.json records the old one
  propose [book] [--apply all|…]            draft mechanisms, tools, edges, and config from a book's text
  remove chapter|mechanism|tool [book] <slug> [--dry-run]
                                            the record, and the prerequisites and mechanisms: entries
                                            that name it; a mechanism's tools and examples need
                                            --with-records
  move tool [book] <tool> --to <mechanism>  bind a tool to another mechanism

Check
  status [book] [--json]                    chapters, stubs, mechanisms, and tools per book
  map [book] [--json]                       which chapters bind which mechanisms: the chapters that bind
                                            none, and the mechanisms no chapter binds
  check [book] [--all] [--quick] [--info] [--download-model]
                                            structure, plus mechanisms that overlap across books; the
                                            meaning pass needs a 550 MB model, downloaded once with
                                            consent (--quick compares wording only); as info, each
                                            chapter's first unlinked use of a glossary term; --info
                                            adds the info-level suggestions
  check <file.mdx> [--json] [--quick]       one content file: each finding with its field and fix; for a
                                            mechanism, similar ones, the judges' calls on it, and which of
                                            its 3 nearest have no verdict (--quick: nearest by wording); for
                                            a chapter, its words against the stub threshold, what it binds,
                                            and the book's other mechanisms
  check <folder|file> [--frame <slug>] [--json] [--release]
                                            any Markdown, where it is: the content contract, plus each frame
                                            section once --frame is given; exits 1 on an error (for CI);
                                            --release checks it as a published book, so drafts are errors
  contract [section] [--json]               the fields a mechanism, tool, example, chapter, glossary entry,
                                            or release note needs
  verify [--all] [--list] [--json]          the checks your change needs, judged by the files it touches
  judge [mechanism] [--judges 3] [--run "<command>"]
                                            ask judges, blind, whether close mechanisms are the same idea: one
                                            mechanism's 3 nearest without a verdict, or the corpus's flagged and
                                            closest pairs; writes a prompt per judge in .bookkit/judging/. With a
                                            judge command (--run, or BOOKKIT_JUDGE_COMMAND), asks each one and
                                            records the answers with the command that gave them; several
                                            (--run again, or one per line) ask the judges in turn
  judge --rulings [--judges 3] [--run "<command>"]
                                            ask judges about your ruled pairs, blind, so check:corpus --eval
                                            can score a new panel (or model) against your rulings
  judge run [folder] [--run "<command>"]    ask the judges that have not answered (default: the newest request)
  judge record [folder]                     record answers saved by hand (default: the newest with answers)
  rule <a> <b> --distinct "<reason>"        rule two mechanisms different ideas, in corpus.json
  merge <keep> <drop> --reason "<why>" [--definition "…"] [--dry-run]
                                            rule them one idea: <drop> becomes <keep> in every book of the
                                            corpus (contract, files, links, config) and corpus.json records it
  sync <mechanism> [--from <book>] [--to <book>]
                                            copy one copy's contract (default: the one edited last) to the
                                            mechanism's other books; --to shares it with a book that has none
  similar "<title>" [--definition "…"] [--semantic]
                                            existing mechanisms, in any book, that a new one might duplicate
  validate [book]                           structure only

Preview and publish
  dev [book] [--port <n>]                   local preview with live reload; runs until stopped
                                            (also: preview, serve, start)
  dev stop|status|logs [book]               stop or find a dev server bookkit dev (or astro dev) left running
  build [book] [--all]                      build one book (no book: the current one, or all)
  export [book] [--out <dir>]               a GitBook folder of the book; says where the PDF and EPUB are
  export [book] --rubric [--out <file>]     the book's corpus as an eval rubric: one criterion per mechanism,
                                            and your rulings as labelled pairs (default:
                                            apps/<book>/exports/rubric.json)
  publish [book] [--dry-run] [--records]  move a book from draft to published: checks it with release
                                            rules first, then sets status: "published" in book.config.ts;
                                            --records also marks its draft records published
  deploy [book...] [--all] [--dry-run [--full]] [--no-build]
                                            verify, build, and check each book, then put it online, all or
                                            none; --dry-run skips the engine's tests (--full runs them);
                                            no book: the current one, or all; --all for every book
                                            (bun run bookkit deploy --help for every option)

Other
  list                                      list the books
  remove book <slug>                        delete a book app (also: remove-book <slug>)
  bets [--json]                             the maintainers' active bet (docs/bets.md), measured from git

bun run bookkit <command> --help (or bun run bookkit help <command>) prints a
command's arguments and examples. Mistype a command, book, or mechanism and
bookkit suggests the closest one.

Examples
  bun run bookkit
  bun run bookkit try ~/notes/runbooks
  bun run bookkit check ./docs/runbooks --frame runbook
  bun run bookkit use running-hot
  bun run bookkit new chapter "Repair has a clock"
  bun run bookkit new mechanism bad-people "Waiting as leverage"
  bun run bookkit check running-hot
  bun run bookkit dev running-hot
  bun run bookkit deploy on-call --dry-run
`);
}
