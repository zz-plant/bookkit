/**
 * The `bookkit` command: answers --help, reads the books, and dispatches.
 * Help text is in lib/bookkit-commands.ts; the commands are in lib/commands/:
 *
 *   context.ts     shared: args, books, focusBook, requireBook, takeBook,
 *                  runScript, applyChanges (flagValue, positionals: lib/cli.ts)
 *   help.ts        help, --help
 *   status.ts      status, map, bets, list, use
 *   new.ts         new, init
 *   check.ts       check [book|folder], validate, try, contract
 *   check-file.ts  check <file>
 *   judge.ts       similar, judge, rule
 *   draft.ts       draft
 *   review.ts      review
 *   define.ts      define
 *   finish.ts      finish
 *   merge.ts       merge, sync
 *   structure.ts   remove, move, rename
 *   publish.ts     dev, build, export, publish
 *   diagnose.ts    triage, redteam, probe
 *   (this file)    verify, deploy, import, propose, new-book, remove-book,
 *                  remove book: each runs a script of its own
 *
 * <command>Command() reads `args` itself; the others take their arguments.
 * Each case imports its command group when it runs, so a command loads only
 * the modules it uses.
 */

import { commandNames, findCommand } from "./lib/bookkit-commands";
import { didYouMean, wantsHelp } from "./lib/cli";
import {
	args,
	command,
	loadBooks,
	runScript,
	withBookFlag,
} from "./lib/commands/context";
import { printHelp, printHelpFor } from "./lib/commands/help";

if (command === "help" || command === "--help" || command === "-h") {
	// `help <command>` is that command's help; `help --help` is help's own.
	if (command === "help" && args[1]) {
		printHelpFor(args[1].startsWith("-") ? ["help"] : args.slice(1));
	}
	printHelp();
	process.exit(0);
}
// `bookkit <command> --help` prints that command's help before it reads or
// writes anything (lib/bookkit-commands.ts).
if (findCommand(command) && wantsHelp(args.slice(1))) printHelpFor(args);

loadBooks();

switch (findCommand(command)?.name ?? command) {
	case "status": {
		await (await import("./lib/commands/status")).statusCommand();
		break;
	}

	case "map": {
		await (await import("./lib/commands/status")).mapCommand();
		break;
	}

	case "bets": {
		await (await import("./lib/commands/status")).betsCommand();
		break;
	}

	case "triage": {
		await (await import("./lib/commands/diagnose")).triageCommand();
		break;
	}

	case "redteam": {
		(await import("./lib/commands/diagnose")).redteamCommand();
		break;
	}

	case "probe": {
		(await import("./lib/commands/diagnose")).probeCommand();
		break;
	}

	case "similar": {
		await (await import("./lib/commands/judge")).similarCommand();
		break;
	}

	case "verify": {
		process.exit(runScript("verify.ts", args.slice(1)));
		break;
	}

	case "check": {
		await (await import("./lib/commands/check")).checkCommand();
		break;
	}

	case "new": {
		(await import("./lib/commands/new")).createNew(args[1], args.slice(2));
		break;
	}

	case "judge": {
		process.exit(
			await (await import("./lib/commands/judge")).judge(args.slice(1)),
		);
		break;
	}

	case "draft": {
		process.exit(
			await (await import("./lib/commands/draft")).draft(args.slice(1)),
		);
		break;
	}

	case "define": {
		process.exit(
			await (await import("./lib/commands/define")).define(args.slice(1)),
		);
		break;
	}

	case "finish": {
		process.exit(
			await (await import("./lib/commands/finish")).finish(args.slice(1)),
		);
		break;
	}

	case "review": {
		process.exit(
			await (await import("./lib/commands/review")).review(args.slice(1)),
		);
		break;
	}

	case "rule": {
		process.exit((await import("./lib/commands/judge")).rule(args.slice(1)));
		break;
	}

	case "merge": {
		process.exit((await import("./lib/commands/merge")).merge(args.slice(1)));
		break;
	}

	case "rename": {
		process.exit(
			(await import("./lib/commands/structure")).renameChapter(args.slice(1)),
		);
		break;
	}

	case "export": {
		await (await import("./lib/commands/publish")).exportCommand();
		break;
	}

	case "sync": {
		process.exit((await import("./lib/commands/merge")).sync(args.slice(1)));
		break;
	}

	case "try": {
		(await import("./lib/commands/check")).tryCommand();
		break;
	}

	case "contract": {
		(await import("./lib/commands/check")).contractCommand();
		break;
	}

	case "dev": {
		await (await import("./lib/commands/publish")).devCommand();
		break;
	}

	case "build": {
		await (await import("./lib/commands/publish")).buildCommand();
		break;
	}

	case "validate": {
		(await import("./lib/commands/check")).validateCommand();
		break;
	}

	case "list": {
		(await import("./lib/commands/status")).listCommand();
		break;
	}

	case "new-book": {
		process.exit(runScript("scaffold-book.ts", args.slice(1)));
		break;
	}

	case "remove-book": {
		process.exit(runScript("remove-book.ts", args.slice(1)));
		break;
	}

	case "remove": {
		if (args[1] === "book") {
			process.exit(runScript("remove-book.ts", args.slice(2)));
		}
		process.exit(
			(await import("./lib/commands/structure")).removeRecord(args.slice(1)),
		);
		break;
	}

	case "move": {
		process.exit(
			(await import("./lib/commands/structure")).moveTool(args.slice(1)),
		);
		break;
	}

	case "import": {
		process.exit(
			runScript("import-book-from-markdown.ts", withBookFlag(args.slice(1))),
		);
		break;
	}

	case "propose": {
		process.exit(runScript("propose-book.ts", withBookFlag(args.slice(1))));
		break;
	}

	case "publish": {
		process.exit(
			(await import("./lib/commands/publish")).publish(args.slice(1)),
		);
		break;
	}

	case "init": {
		(await import("./lib/commands/new")).createNew("book", args.slice(1));
		break;
	}

	case "deploy": {
		// Verifies and checks every book, then publishes all or none: scripts/deploy.ts.
		process.exit(runScript("deploy.ts", args.slice(1)));
		break;
	}

	case "use": {
		(await import("./lib/commands/status")).useCommand();
		break;
	}

	case "mcp": {
		process.exit(runScript("mcp-server.ts", args.slice(1)));
		break;
	}

	case "upgrade": {
		process.exit((await import("./lib/commands/upgrade")).upgradeCommand());
		break;
	}

	default: {
		console.error(
			`Unknown command "${command}".${didYouMean(command, commandNames())} Run bun run bookkit help for every command.`,
		);
		process.exit(1);
	}
}
