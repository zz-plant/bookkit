import os
B = "/Users/kanav/Documents/GitHub/bookkit/apps/crumple-zone/src/content/book"

def w(path, fm, body):
    lines = ["---"]
    for k, v in fm.items():
        if isinstance(v, list):
            lines.append(f"{k}:")
            for item in v:
                lines.append(f'  - "{item}"')
        else:
            lines.append(f'{k}: "{v}"')
    lines.append("---")
    lines.append("")
    lines.append(body)
    with open(path, "w") as f:
        f.write("\n".join(lines))

M = os.path.join(B, "mechanisms")
for f in os.listdir(M):
    os.remove(os.path.join(M, f))

mechs = [
("crumple-zone","Crumple Zone","Individuals absorb the force of systemic failures. Human bodies become the cheapest shock absorbers.",
 ["Systems transfer risk to individuals rather than containing it","Institutional stability is purchased by externalizing pressure onto people","The human body is treated as the cheapest available infrastructure"],
 ["Only about physical injury","A metaphor without structural consequences","About individual resilience or personal failure"],
 ["As institutions automate away slack, crumple zones will expand","Institutional failure rates will increase as fewer humans absorb systemic shock"],
 ["Identify 3 systems that use you as a crumple zone","What happens when a crumple zone reaches capacity?"],
 "Foundational concept. When a car crashes, the crumple zone absorbs force. Social systems have crumple zones too — but the passengers are institutions, and the crumple zones are people. Systems are designed to externalize harm because human bodies are cheaper than structural reform."),
("frictionless-extraction","Frictionless Extraction","Seamlessness serves the extractor, not the extracted. Every removal of friction removes a refusal point.",
 ["UX optimization primarily benefits the platform","Friction is sometimes a feature that creates space for refusal","What is called user experience is often extraction experience"],
 ["That all friction is bad","That removing friction is always neutral","A Luddite rejection of convenience"],
 ["Frictionless design will be marketed as user-centric while serving extractive ends","Regulation will mandate friction points as refusal interfaces"],
 ["Name a frictionless experience you value. Who else benefits?","Where in your life would adding friction be protective?"],
 "One-click purchasing, auto-renewing subscriptions, infinite scroll — these are refusal-removal mechanisms disguised as convenience."),
("refusability-gap","Refusability Gap","The ability to say no is treated as optional when it should be a structural design requirement.",
 ["Refusal is not currently designed into most systems","The absence of refusal points is a political choice","Systems that make refusal impossible are coercive by design"],
 ["That every system needs a no button","That refusal is only individual","About being difficult"],
 ["Refusability will become a competitive differentiator","Systems without refusal points will face regulatory pressure"],
 ["Where do you lack the ability to say no?","What would a refusable version look like?"],
 "Most systems treat refusal as something to manage, not respect. Closing the gap means making no as easy as yes."),
("coercion-by-design","Coercion by Design","Coercion is not accidental. It is designed into systems, and therefore can be designed out.",
 ["Coercive outcomes result from design choices","Systems can be built where coercion is structurally impossible","Designers should bear the burden of proving non-coercion"],
 ["That all coercion is intentional or malicious","That removing coercion is easy","That individual bad actors are the problem"],
 ["Design ethics will shift from do-no-harm to make-harm-impossible","Coercion audits will become standard"],
 ["Identify a system you participate in involuntarily","How could it be redesigned for genuinely optional participation?"],
 "When a hospital demands payment before treatment, no individual is cruel — but the system is coercive by design."),
("sanctiphagy","Sanctiphagy (Virtue Extraction)","Systems consume and commodify moral goodness. Virtue is extracted, branded, and the husk discarded.",
 ["Moral behavior is treated as a resource to be mined","Institutions extract reputational value from good acts","The language of ethics is co-opted to justify extraction"],
 ["That virtue is genuinely valued by extracting institutions","That ethical branding reflects ethical behavior","About individual hypocrisy"],
 ["Sanctiphagic cycles will accelerate as trust declines","The gap between stated values and structural behavior will grow visible"],
 ["Find a company claiming ethical values. What would structural alignment require?","What virtues of yours have been extracted by institutions?"],
 "From sanctus (sacred) + -phagy (eating). Institutions eat virtue. They extract it, brand it, discard the rest."),
("maintenance-deficit","Maintenance Deficit","Maintenance is invisible labor until failure. The gap between needs and resources is the deficit.",
 ["Maintenance is systematically undervalued and underfunded","The deficit accumulates silently until catastrophic failure","Those who do maintenance labor are rendered invisible"],
 ["That maintenance is boring or low-skill","That systems persist without active work","About checklists"],
 ["The maintenance deficit will grow as short-term optimization dominates","Major failures will trace back to deferred maintenance"],
 ["What in your life is being maintained that you do not notice?","Who does maintenance you benefit from but do not see?"],
 "Everything that persists requires ongoing work. The bridge does not just stay up. Maintenance is the most undervalued human activity."),
("death-of-slack","The Death of Slack","Eliminating buffer and margin breaks people instead of systems. Slack is structural mercy.",
 ["Efficiency optimization eliminates the buffer that protects humans","When systems run at 100 percent, people become the shock absorber","Slack is the difference between a working system and a broken person"],
 ["That slack is laziness","That optimal performance means zero buffer","About relaxing more"],
 ["Elimination of slack will produce burnout cascades","Organizations preserving slack will outperform those that eliminate it"],
 ["Where in your work has slack been eliminated?","What would it cost to restore a 20 percent buffer?"],
 "Slack is the difference between capacity and demand — the unallocated hour, the reserve fund. It is the crumple zone that absorbs shock before it reaches people."),
("institutional-apoptosis","Institutional Apoptosis","Programmed death of institutions that can no longer maintain their function.",
 ["Institutions should be capable of dying when they no longer serve their purpose","The inability to die is itself institutional pathology","Apoptosis is a healthy function, not a failure"],
 ["That institutions should be destroyed violently","That all old institutions are bad","About market creative destruction"],
 ["Institutions will fight apoptosis with increasing desperation","New organizational forms will include sunset clauses by default"],
 ["Name an institution that outlived its purpose. What prevents it from dying?","What would institutional apoptosis look like?"],
 "In biology, apoptosis is programmed cell death. Institutions lack this capacity, persisting long after function is lost."),
("temporal-capture","Temporal Capture","Institutions capture human duration as a resource. Time is extracted but never accounted for.",
 ["Human time is systematically extracted without compensation","Waiting, paperwork, and procedural delay are temporal taxation","Time sovereignty is the right to control your own duration"],
 ["That time theft is always obvious","That waiting is neutral","About poor time management"],
 ["Temporal capture will intensify as attention economy matures","Time sovereignty will emerge as a labor rights frontier"],
 ["How much of your time this week was captured by institutions?","What would it look like for an institution to account for consumed time?"],
 "When you wait on hold or fill redundant paperwork, your time is captured through processes treating your duration as a free resource."),
("clearance-culture","Clearance Culture","Needing institutional permission to re-enter after any deviation from expected behavior.",
 ["Deviation triggers a clearance process the deviant must manage","The burden of re-entry falls entirely on the person who deviated","Clearance is ongoing punishment disguised as due process"],
 ["That clearance processes are fair","That re-entry should be easy","About criminal background checks specifically"],
 ["Clearance culture will expand as surveillance infrastructure grows","Informal social media reputation clearance will become more damaging"],
 ["When have you been put through a clearance process?","What would re-entry look like if the burden were on the institution?"],
 "The clearance process is the gauntlet someone must run to return after deviating from institutional norms."),
("vibe-legitimacy","Vibe-Based Legitimacy","Authority derived from aesthetic and affect rather than demonstrated competence.",
 ["Institutions rely on aesthetic signals rather than substantive proof","Charisma and cultural fluency substitute for demonstrated effectiveness","The gap between vibe and substance is the legitimacy deficit"],
 ["That aesthetics do not matter","That all charismatic authority is illegitimate","About authenticity as individual virtue"],
 ["Vibe-based legitimacy will grow as trust in traditional authority declines","Vibe collapses will become more frequent and consequential"],
 ["Name an institution you trust. How much is vibes vs. competence?","What would happen to your trust if the aesthetic changed?"],
 "Some institutions earn legitimacy through demonstrated competence. Others earn it through vibe — the right branding, language, cultural signals."),
("governance-by-caricature","Governance by Caricature","Institutions ruled by distorted, simplified, weaponized versions of their own principles.",
 ["Institutional self-description diverges sharply from behavior","The caricature version of a principle is easier to enforce than the real thing","Stated values become tools for suppressing internal dissent"],
 ["That institutions are lying about their values","That simplification is always bad","About individual hypocrisy"],
 ["Governance by caricature will intensify during legitimacy crises","The gap between principles and behavior will be a primary site of contestation"],
 ["Find your institution stated values. How do they differ from actual practice?","What would it take to close the gap?"],
 "The institution describes itself as just, innovative, caring. The caricature enforces a weaponized version that has no nuance."),
("consent-maintenance-pressure","Consent Maintenance Pressure","Forces preventing withdrawal of consent after it has been given.",
 ["Initial consent is treated as permanent","Social, economic, institutional pressures prevent consent withdrawal","The right to exit is more important than the right to enter"],
 ["That people who stay have genuinely consented","That consent is a one-time event","About romantic relationships exclusively"],
 ["Consent maintenance pressure will be recognized as distinct coercion","Exit rights will become a standard design requirement"],
 ["Where have you felt unable to withdraw consent?","What made exit impossible or costly?"],
 "We treat consent as one-time. But ongoing consent requires the ability to withdraw. When systems make withdrawal costly, the initial yes becomes a trap."),
("wound-worship","Wound Worship","How harm becomes sacred to silence dissent. Suffering is valorized to prevent structural change.",
 ["Individual suffering is celebrated as virtuous while structural causes are ignored","Trauma language is co-opted to prevent systemic critique","Wound narratives are deployed to shut down those asking for change"],
 ["That people should not talk about their wounds","That all suffering narratives are manipulative","About denying experience"],
 ["Wound worship will intensify as structural critique matures","Co-option of trauma language will face backlash"],
 ["When have you seen suffering used to silence demands for change?","What is the difference between honoring experience and weaponizing it?"],
 "Harm becomes holy. Suffering confers moral authority. Those asking for structural change are told they are disrespecting the wounded."),
("cowardice-of-inference","The Cowardice of Inference","Drawing the correct conclusion without the courage to act on it.",
 ["Institutions regularly identify problems they refuse to solve","The diagnosis-to-action gap is maintained by incentive structures","Inference without action is institutional bad faith"],
 ["That people do not know what is wrong","That the solution is more data","About individual cowardice"],
 ["The inference-action gap will widen as data improves while action stagnates","Institutions that close the gap will gain advantage"],
 ["What do you know is wrong that you have not acted on?","What institutional incentive prevents action?"],
 "Reports are written. Findings are published. The diagnosis is clear. And nothing changes. The institution commissions knowledge and refuses to be changed by it."),
("pyrrhic-condition","The Pyrrhic Condition","Winning in a way that destroys what made winning worthwhile.",
 ["Victories that cost what you were fighting to protect are systemic failures","Institutional incentive structures reward Pyrrhic outcomes","Diagnose by asking: what did winning cost?"],
 ["That all victories are Pyrrhic","That winning is always bad","About sports metaphors"],
 ["Pyrrhic victories will become more common as zero-sum competition intensifies","Recognition of Pyrrhic dynamics will reshape definitions of success"],
 ["When have you won something and regretted the cost?","What would a non-Pyrrhic version look like?"],
 "You win the promotion but lose the relationships. You win the lawsuit but lose the community. Winning a game whose stakes you did not set."),
("volatocracy","Volatocracy","Rule through manufactured instability. Keeping people too unsteady to organize.",
 ["Instability is deliberately produced to prevent collective action","Economic, informational, social volatility are governance tools","Stability becomes a luxury good rather than baseline"],
 ["That all instability is intentional","A conspiracy theory","About natural market fluctuations"],
 ["Volatocratic governance will intensify with algorithmic content distribution","Stability will become an increasingly salient political demand"],
 ["When have you felt too destabilized to act collectively?","What produced that instability? Who benefited?"],
 "When people are steady enough to organize, they demand change. When destabilized, they cannot organize. Volatility is a governance strategy."),
("toil-fetishism","Toil Fetishism","Suffering and prolonged effort worshipped as markers of legitimacy. Ease is treated as cheating.",
 ["Hard work is valorized for its own sake, not for outcomes","Ease, efficiency, and tools are suspected of being illegitimate shortcuts","Fetishization of toil excludes those who cannot or will not perform suffering"],
 ["That hard work is bad","That all efficiency is good","About laziness"],
 ["Toil fetishism will persist as a gatekeeping mechanism","AI tools will intensify fetishization of real effortful work"],
 ["Where have you been made to feel that ease is cheating?","Who benefits from your belief that struggle equals legitimacy?"],
 "Why do we trust the writer who suffered for years more than the one who finished in months? Toil fetishism treats visible effort as proof of value."),
("surveillance-universality","Universal Design vs Surveillance","When systems must serve everyone, the incentive to surveil and sort disappears.",
 ["Universality structurally disincentivizes surveillance","Means-testing requires surveillance infrastructure","Universal systems are simpler, cheaper, less coercive than targeted ones"],
 ["That universal systems are always better","That surveillance is the only problem with means-testing","About welfare policy exclusively"],
 ["Universality arguments will gain traction as surveillance costs become visible","Means-tested systems will face legitimacy challenges"],
 ["Where do you undergo eligibility verification?","What would a universal version look like?"],
 "To determine who qualifies, you must surveil everyone. Universal systems structurally eliminate the need to monitor, sort, and exclude."),
("credibility-access-control","Credibility as Access Control","Credibility is gatekeeping disguised as quality control. Who gets believed determines access.",
 ["Credibility assessments function as structural filters","The credibility frame obscures power dynamics of who gets believed","Access to resources and justice depends on passing credibility gates"],
 ["That credibility does not matter","That all credibility assessments are illegitimate","About lying"],
 ["Credibility-access-control will become more visible","Alternative credibility systems will emerge outside institutional gatekeeping"],
 ["When have you been disbelieved? What was at stake?","What made you credible or not credible in that moment?"],
 "Some people are believed by default. Others must prove credibility before being heard. Credibility assessments function as structural gatekeeping."),
]

for (slug,title,definition,is_list,isNot,predictions,tests,desc) in mechs:
    fm = {"slug":slug,"status":"draft","title":title,"definition":definition,"is":is_list,"isNot":isNot,"predictions":predictions,"tests":tests}
    body = f"# {title}\n\n{desc}\n"
    w(os.path.join(M,f"{slug}.mdx"), fm, body)

print(f"Created {len(mechs)} mechanisms")

# CHAPTERS
C = os.path.join(B, "chapters")
for f in os.listdir(C):
    os.remove(os.path.join(C, f))

chapters = [
("00-overview","Everyone is a Crumple Zone","The thesis: systems externalize harm onto humans by design. Introduces the crumple zone as unifying metaphor. Maps the book structure."),
("01-frictionless-for-whom","Frictionless for Whom","Seamlessness as extraction. Every removal of friction removes a refusal point. Source: Frictionless for Whom, Optimizing the User, The Post-User Web."),
("02-the-right-to-say-no","The Right to Say No","Refusal as structural requirement. Designing systems where coercion is impossible. Source: Refusability, Designing Systems Without Coercion, Insulation from Coercion."),
("03-you-can-design-harm-out","You Can Design Harm Out","Principles do not stop machines. Design encodes ethics. Source: You Can Design Harm Out, The Cowardice of Inference, Toothless Ethics."),
("04-the-death-of-slack","The Death of Slack","Eliminating margin eliminates mercy. Humans absorb the shock. Source: Death of Slack, Temporal Capture, The Pyrrhic Condition."),
("05-to-be-is-to-be-maintained","To Be Is To Be Maintained","Maintenance is the work that keeps things alive. Invisible until failure. Source: To Be Is To Be Maintained, Capture of Maintenance, When Conscience Runs Out."),
("06-institutional-apoptosis","Institutional Apoptosis","Institutions that cannot die caricature themselves instead. Source: Institutional Apoptosis, Governance by Caricature, Vibe-Based Legitimacy."),
("07-sanctiphagy","How Virtue Gets Eaten","Moral goodness extracted, commodified, discarded. Source: Sanctiphagy, Wound Worship, Heartbroken and Devastated."),
("08-consent-and-clearance","Consent Maintenance and Clearance Culture","The right to exit is the foundation of genuine consent. Source: Consent Maintenance Pressure, Clearance Culture, Pending."),
("09-time-sovereignty","Time Sovereignty","Reclaiming duration. Time is what institutions extract. Source: Time Sovereignty, Stop Preaching Start Engineering, Survival Is Not Proof of Worth."),
("10-building-the-opposite","Building the Opposite","The positive project. Technologies are crystallized politics. Source: Technologies Are Crystallized Politics, Speculative Artifacts, Mesopower."),
]
for (slug,title,desc) in chapters:
    fm = {"slug":slug,"status":"draft","title":title}
    body = f"# {title}\n\n{desc}\n\n*Draft chapter — to be written from blog source posts.*\n"
    w(os.path.join(C,f"{slug}.mdx"), fm, body)
print(f"Created {len(chapters)} chapters")

# EXAMPLES
E = os.path.join(B, "examples")
for f in os.listdir(E):
    os.remove(os.path.join(E, f))

examples = [
("captive-insurance","crumple-zone","Healthcare","Captive Insurance as Structural Crumple Zone","How captive insurance externalizes risk onto captive populations. Source: What is Captive Insurance?"),
("catastrophe-bonds","temporal-capture","Finance","Catastrophe Bonds as Temporal Arbitrage","How Wall Street prices disaster through temporal capture. Source: Catastrophe Bonds."),
("actuarial-medicine","maintenance-deficit","Healthcare","Actuarial Medicine and Hidden Exclusion","Spreadsheets replace clinical judgment. Source: Actuarial Medicine and Hidden Exclusion."),
("stock-market-cure","pyrrhic-condition","Healthcare","The Stock Market Hates a Cure","Markets structurally disincentivize curative treatments. Source: The Stock Market Hates a Cure."),
("doctors-no-new-tech","cowardice-of-inference","Healthcare","Why Doctors Say No to New Tech","The inference-action gap in clinical settings. Source: Why Doctors Say No to New Tech."),
("private-equity-doctors","coercion-by-design","Healthcare","Should We Be Angry at Doctors Who Sell to PE","Structural complicity and the coercion of market logic. Source: Should We Be Angry at Doctors."),
("spectacle-of-fraud","vibe-legitimacy","Finance","The Spectacle of Fraud","How aesthetic legitimacy substitutes for structural accountability. Source: The Spectacle of Fraud."),
("haidt-crutch","credibility-access-control","Media","Jonathan Haidt as Intellectual Crutch","Credibility laundering through academic authority. Source: Jonathan Haidt: The Intellectual Crutch."),
("ai-ceo-contradiction","sanctiphagy","Technology","The Ethical AI CEO Contradiction","Virtue extraction in technology leadership. Source: The Ethical AI CEO Is a Contradiction."),
("person-behind-desk","crumple-zone","Healthcare","The Person Behind the Desk","The human crumple zone in healthcare bureaucracy. Source: The Person Behind the Desk."),
]
for (slug,mechanism,domain,title,desc) in examples:
    fm = {"slug":slug,"mechanism":mechanism,"domain":domain,"title":title,"status":"draft"}
    body = f"# {title}\n\n{desc}\n"
    w(os.path.join(E,f"{slug}.mdx"), fm, body)
print(f"Created {len(examples)} examples")

# TOOLKIT
T = os.path.join(B, "toolkit")
for f in os.listdir(T):
    os.remove(os.path.join(T, f))

toolkit = [
("leave-dishes","death-of-slack","How to Leave the Dishes in the Sink","Practical harm reduction by restoring slack. Source: How to Leave the Dishes in the Sink."),
("smuggle-idea","governance-by-caricature","How to Smuggle an Idea","Bypassing caricature governance. Source: How to Smuggle an Idea."),
("stop-preaching","cowardice-of-inference","Stop Preaching. Start Engineering.","Close the inference-action gap. Source: Stop Preaching. Start Engineering."),
("vaping-less","maintenance-deficit","An Autistic Guide to Vaping Less","Harm reduction as maintenance practice. Source: An Autistics Guide to Vaping Less."),
("puncture-cleanroom","vibe-legitimacy","Puncture the Cleanroom","Disrupt vibe-based legitimacy. Source: Puncture the Cleanroom."),
("assume-awareness","crumple-zone","Assume Maximum Awareness","Identify where you are being used as infrastructure. Source: Assume Maximum Awareness."),
("engineering-mutuality","coercion-by-design","Engineering Mutuality","Design systems where coercion is structurally impossible. Source: Engineering Mutuality."),
("praise-fickleness","consent-maintenance-pressure","In Praise of Fickleness","Exercise the right to change your mind. Source: In Praise of Fickleness."),
("say-it-again","wound-worship","Say It Again Anyway","Resist wound worship through persistence. Source: Say It Again Anyway."),
("cognitive-scarcity","frictionless-extraction","Design for Cognitive Scarcity","Add protective friction. Source: How to Design for Cognitive Scarcity."),
]
for (slug,mechanism,title,desc) in toolkit:
    fm = {"slug":slug,"mechanism":mechanism,"title":title,"status":"draft"}
    body = f"# {title}\n\n{desc}\n\n**Counters:** {mechanism}\n"
    w(os.path.join(T,f"{slug}.mdx"), fm, body)
print(f"Created {len(toolkit)} toolkit items")

# GLOSSARY
G = os.path.join(B, "glossary")
for f in os.listdir(G):
    os.remove(os.path.join(G, f))

glossary = [
("crumple-zone","Crumple Zone","The component of a system designed to absorb damage so the rest can keep running. In social systems, human beings are the crumple zone."),
("frictionless-extraction","Frictionless Extraction","Seamlessness that serves the extractor by removing refusal points disguised as user experience."),
("refusability-gap","Refusability Gap","The distance between theoretically being able to refuse and refusal being structurally supported."),
("coercion-by-design","Coercion by Design","The principle that coercive outcomes are design choices, not accidents, and can be designed out."),
("sanctiphagy","Sanctiphagy","From sanctus (sacred) + -phagy (eating). The institutional process of consuming moral goodness for reputational gain."),
("maintenance-deficit","Maintenance Deficit","The accumulated gap between the maintenance a system needs and the maintenance it receives."),
("death-of-slack","Death of Slack","The elimination of buffer and margin, causing humans to absorb systemic shock."),
("institutional-apoptosis","Institutional Apoptosis","Programmed institutional death as a healthy function rather than a catastrophe."),
("temporal-capture","Temporal Capture","The institutional extraction of human duration as an unaccounted resource."),
("clearance-culture","Clearance Culture","The process by which someone who deviated from norms must earn permission to return."),
("vibe-legitimacy","Vibe-Based Legitimacy","Authority derived from aesthetic and affect rather than demonstrated structural competence."),
("governance-by-caricature","Governance by Caricature","Rule by distorted, simplified, weaponized versions of an institution own stated principles."),
("consent-maintenance-pressure","Consent Maintenance Pressure","Forces that prevent withdrawing consent after it has been given."),
("wound-worship","Wound Worship","The valorization of suffering to prevent demands for structural change."),
("cowardice-of-inference","Cowardice of Inference","Drawing correct conclusions without the courage to act on them."),
("pyrrhic-condition","Pyrrhic Condition","Winning in a way that destroys what made winning worthwhile."),
("volatocracy","Volatocracy","Governance through manufactured instability that prevents collective action."),
("toil-fetishism","Toil Fetishism","The worship of suffering and prolonged effort as markers of legitimacy."),
("surveillance-universality","Universal Design vs Surveillance","The principle that universal systems structurally disincentivize surveillance."),
("credibility-access-control","Credibility as Access Control","Gatekeeping disguised as quality control; who gets believed determines who gets access."),
("mesopower","Mesopower","Power operating at the intermediate level that shapes what is possible before anyone notices."),
("interiority-theater","Interiority Theater","Performing inner life for external validation."),
("social-temperature","Social Temperature","A measure of masking pressure in any environment."),
("lucid-disorientation","Lucid Disorientation","Productive confusion as a state of clarity."),
("structural-ahimsa","Structural Ahimsa","Non-harm understood as a structural principle rather than personal virtue."),
]
for (slug,term,defn) in glossary:
    fm = {"slug":slug,"status":"draft","term":term}
    body = f"# {term}\n\n{defn}\n"
    w(os.path.join(G,f"{slug}.mdx"), fm, body)
print(f"Created {len(glossary)} glossary entries")

print("\nDone populating Crumple Zone book!")
