import { buildWeavePrompt } from "../../app/public/prompt-builder.js";

const members = [
  {
    party: "LIK", rank: 1, name: "Benjamin Netanyahu", hebrew: "בנימין נתניהו",
    status: "Prime minister and Likud chair · reported filed slot 1",
    treatment: "critical",
    sourceNote: {
      text: "* Rare uses an attributed participant-supplied paraphrase, not a verified verbatim transcript. The exact 2026 October 7 interview remains a verified alternate.",
      url: "https://lahav.substack.com/p/i-reported-on-netanyahu-green-lighting",
    },
    quotes: [
      {
        tier: "Common", date: "2017-01-02", confidence: "verified",
        original: "אמרתי לכם ואני חוזר ואומר לכם — לא יהיה כלום כי אין כלום.",
        translation: "I told you, and I repeat: There will be nothing, because there is nothing.",
        context: "Recorded Likud faction remarks shortly before questioning under caution over suspected gifts.",
        source: "https://news.walla.co.il/item/3028022",
        scene: "Off-centre seated three-quarter portrait at a plain faction-room table with restrained vertical room panels.",
        flavor: "One clearly visible unlit cigar resting in a plain ashtray on the table; disclosed editorial symbolism, not documentary reconstruction.",
      },
      {
        tier: "Uncommon", date: "2015-03-17", confidence: "verified",
        original: "שלטון הימין בסכנה. המצביעים הערבים נעים בכמויות אדירות לקלפי. עמותות השמאל מביאות אותם באוטובוסים.",
        translation: "Right-wing rule is in danger. Arab voters are moving to the polling station in enormous numbers. Left-wing NGOs are bringing them in buses.",
        context: "Election-day Likud mobilization video; Netanyahu later apologized for the offense caused and said he opposed organized political mobilization, not Arab citizens voting.",
        source: "https://www.youtube.com/watch?v=Q2cUoglR1yk",
        scene: "Slightly elevated three-quarter speaking pose, shoulders held within a narrow institutional frame; cool overhead light and substantial negative space.",
        flavor: "A small group of four generic distant silhouettes moving toward him at the far image edge; non-ethnicized, non-threatening, and metaphorical.",
      },
      {
        tier: "Rare", date: "2019-03-11", confidence: "adapted", adapted: true,
        original: "מי שרוצה לסכל הקמה של מדינה פלסטינית צריך לתמוך בחיזוק החמאס ובהעברת כסף לחמאס. זה חלק מהאסטרטגיה שלנו – לבדל בין הפלסטינים בעזה לבין הפלסטינים ביהודה ושומרון.",
        translation: "Anyone who wants to thwart a Palestinian state should support strengthening Hamas and transferring money to Hamas. This is part of our strategy—to separate Palestinians in Gaza from Palestinians in the West Bank.",
        context: "* Attributed policy position reported from a Likud faction meeting; wording was supplied by participants and paraphrased, with no recording or verbatim transcript.",
        source: "https://lahav.substack.com/p/i-reported-on-netanyahu-green-lighting",
        scene: "Tight frontal crop, guarded expression, hard lateral light; dark government-chamber geometry receding into shadow.",
        flavor: "One small closed dark suitcase resting on the edge of a table or podium; no visible cash, recipient, insignia, or documentary claim.",
      },
    ],
  },
  {
    party: "LIK", rank: 2, name: "Israel Katz", hebrew: "ישראל כץ",
    status: "Defense minister · editorially chosen member · reported filed slot 6",
    treatment: "critical",
    quotes: [
      {
        tier: "Common", date: "2020-11-12", confidence: "verified",
        original: "בעניין הנמלים - כן.",
        translation: "When it comes to ports—yes.",
        context: "Facebook reply to a commenter asking whether Katz considered himself greater than Herod; the answer was limited to ports.",
        source: "https://www.calcalist.co.il/local/articles/0,7340,L-3871373,00.html",
        scene: "Katz at a modern container port beside an oversized Herodian stone silhouette; cranes dwarf both without presenting the boast as fact.",
      },
      {
        tier: "Uncommon", date: "2020-11-12", confidence: "verified",
        original: "אני הצלחתי, ע״י בניית שני נמלים חדשים בחיפה ואשדוד ושדרוג הקיימים עם שני מפעילים בין לאומיים ענקיים ושלישי בדרך והכנסת תחרות שתהפוך את ישראל למוקד אזורי ובין לאומי של פעילות ימית.",
        translation: "I succeeded, by building two new ports and upgrading the existing ones, introducing competition that will turn Israel into a regional and international maritime hub.",
        context: "Follow-up Facebook reply comparing his port record with Herod; part of the claim is explicitly future-tense.",
        source: "https://www.ynet.co.il/economy/article/S13Xw005YP",
        scene: "Presenting a trade-route map where solid port infrastructure transitions into unfinished dotted routes, separating completed work from projected claims.",
      },
      {
        tier: "Rare", date: "2021-01-21", confidence: "verified",
        original: "אני פעמיים לקחתי אותה לתפקידים בחופשת לידה, צריך להבין שיש פה השקפת עולם מבחינתי - אני לא מוכן שבניית משפחה תעכב נשים מלעשות קריירה בכירה.",
        translation: "Twice, I brought her into positions while she was on maternity leave. I am not prepared for building a family to hold women back from senior careers.",
        context: "Recorded interview attacking former director-general Keren Turner-Eyal after her criticism while invoking his earlier advancement of her.",
        source: "https://www.ynet.co.il/economy/article/ry300c3Uk00",
        scene: "Formal office-interview portrait with two empty executive chairs and calendar geometry; do not depict or caricature Turner-Eyal.",
      },
    ],
  },
  {
    party: "LIK", rank: 3, name: "Amir Ohana", hebrew: "אמיר אוחנה",
    status: "Speaker of the Knesset · reported filed slot 3",
    treatment: "critical",
    quotes: [
      {
        tier: "Common", date: "2019-06-12", confidence: "review",
        original: "לא כל פסיקה צריך לבצע, כמו שלא כל חוק צריך לבצע.",
        translation: "Not every ruling has to be carried out, just as not every law has to be carried out.",
        context: "Earlier Kan Bet formulation revisited in a recorded N12 interview; Ohana later clarified that court decisions should be respected except in extreme life-threatening circumstances.",
        source: "https://www.mako.co.il/news-law/legal-q2_2019/Article-65a73c995ac4b61027.htm",
        scene: "Neutral televised-interview frame under hard split light, with abstract court and ministry planes but no gavel or invented ruling.",
      },
      {
        tier: "Uncommon", date: "2019-06-12", confidence: "verified",
        original: "הם היו מעדיפים את הימין שלהם חשוך. יותר נוח להם להיות כוחות האור נגד כוחות החושך.",
        translation: "They would have preferred their political right dark. It is more convenient for them to be the forces of light against the forces of darkness.",
        context: "Recorded N12 interview responding to criticism from parts of the LGBT community after boos at Jerusalem Pride.",
        source: "https://www.mako.co.il/news-law/legal-q2_2019/Article-65a73c995ac4b61027.htm",
        scene: "Close interview portrait with restrained division between institutional darkness and softly defocused Pride color; no caricature of either group.",
      },
      {
        tier: "Rare", date: "2023-09-06", confidence: "verified",
        original: "הכנסת לא תקבל בהכנעה את רמיסתה.",
        translation: "The Knesset will not submissively accept being trampled.",
        context: "Recorded parliamentary statement warning the Supreme Court against invalidating Basic Laws.",
        source: "https://www.mako.co.il/news-politics/2023_q3/Article-eae0670b6fa6a81027.htm",
        scene: "Ohana at a parliamentary lectern against restrained institutional architecture and a legal-document motif; no threatening imagery.",
      },
    ],
  },
  {
    party: "LIK", rank: 4, name: "Yariv Levin", hebrew: "יריב לוין",
    status: "Justice minister and deputy prime minister · reported filed slot 4",
    treatment: "critical",
    quotes: [
      {
        tier: "Common", date: "2023-01-04", confidence: "verified",
        original: "היועצים המשפטיים כשמם כן הם – יועצים ולא מחליטים. כשהם מייצגים את הממשלה הם צריכים לייצג את הממשלה ולא את עמדתם הפרטית.",
        translation: "Legal advisers are advisers, not decision-makers. When representing the government, they must represent the government rather than their personal position.",
        context: "Recorded formal launch of the first stage of Levin’s judicial-governance program.",
        source: "https://mida.org.il/2023/01/04/%D7%94%D7%A6%D7%94%D7%A8%D7%AA-%D7%9C%D7%95%D7%99%D7%9F-%D7%94%D7%A8%D7%A4%D7%95%D7%A8%D7%9E%D7%94-%D7%94%D7%9E%D7%AA%D7%95%D7%9B%D7%A0%D7%A0%D7%AA-%D7%91%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA/",
        scene: "Tight frontal portrait between abstract adviser and decision-maker nameplate shapes; no literal labels rendered in the art.",
      },
      {
        tier: "Uncommon", date: "2023-01-16", confidence: "verified",
        original: "אתם בכל הכבוד לא עומדים מעל מי שהציבור בחר. אף אחד לא שמכם לקבוע מה האינטרס הציבורי.",
        translation: "With all due respect, you do not stand above those the public elected. No one appointed you to determine the public interest.",
        context: "Knesset Constitution Committee exchange with Deputy Attorney General Gil Limon.",
        source: "https://m.knesset.gov.il/EN/News/PressReleases/Pages/press16123r.aspx",
        scene: "Three-quarter pose across an abstract committee table from legal-adviser silhouettes; no ballot box or words baked into the image.",
      },
      {
        tier: "Rare", date: "2023-02-21", confidence: "verified",
        original: "דבר לא ירתיע אותי מלבצע רפורמה עמוקה ונדרשת במערכת המשפט, בלי עיכובים ובלי מסמוסים.",
        translation: "Nothing will deter me from carrying out a deep and necessary reform of the judicial system, without delays and without watering it down.",
        context: "After first-reading approval of legislation changing the Judicial Selection Committee and review of Basic Laws.",
        source: "https://main.knesset.gov.il/News/PressReleases/pages/press21.02.23.aspx",
        scene: "Off-centre profile at a legislative drafting desk under severe overhead light; clocks and eraser-like forms remain abstract and unlabelled.",
      },
    ],
  },
  {
    party: "DEM", rank: 1, name: "Yair Golan", hebrew: "יאיר גולן",
    status: "Democrats chair · reported submitted slot 1",
    treatment: "favorable",
    quotes: [
      {
        tier: "Common", date: "2025-05-20", confidence: "review",
        original: "הגיע הזמן שיהיה לנו עמוד שדרה מפלדה מחושלת – עלינו לעמוד על הערכים שלנו כמדינה ציונית, יהודית ודמוקרטית.",
        translation: "We must stand up for our values as a Zionist, Jewish and democratic state.",
        context: "Statement clarifying his position following a contentious radio interview.",
        source: "https://www.maariv.co.il/breaking-news/article-1198089",
        scene: "Open square-shouldered stance at a neutral civic lectern; relaxed hands, warm parchment/brass light, restrained red accent.",
      },
      {
        tier: "Uncommon", date: "2026-07-20", confidence: "verified",
        original: "ההחלטה הראשונה שנעביר בממשלה מיד כשנשב סביב השולחן, תהיה הקמת ועדת חקירה ממלכתית.",
        translation: "The first decision we will pass in government will be to establish a state commission of inquiry.",
        context: "Announcement of the Democrats’ primary results.",
        source: "https://www.mako.co.il/news-israel-elections/2026/Article-56925b75e108f91027.htm",
        scene: "Three-quarter pose at a public-policy roundtable, listening before speaking; open palm and plain civic interior.",
      },
      {
        tier: "Rare", date: "2026-07-20", confidence: "verified",
        original: "הרשימה הזאת לא תקבע רק מי יישב בכנסת. היא תקבע כמה כוח יהיה לנו להחזיר לישראל ביטחון, דמוקרטיה ותקווה.",
        translation: "This list will determine how much power we have to restore security, democracy and hope to Israel.",
        context: "Opening of primary voting and appeal to party members.",
        source: "https://www.ynet.co.il/news/article/bkozieiezg",
        scene: "Standing in a non-specific community hall after discussion; approachable posture and modest teal/brass reflected light.",
      },
    ],
  },
  {
    party: "DEM", rank: 2, name: "Naama Lazimi", hebrew: "נעמה לזימי",
    status: "Sitting Labor-faction MK · reported submitted Democrats slot 2",
    treatment: "favorable",
    quotes: [
      {
        tier: "Common", date: "2021-07-27", confidence: "verified",
        original: "דמוקרטיה לא נגמרת בביקור בקלפי, בה כל אזרח הוא בעל הכוח לעצב את חייו, ולבנות את המציאות סביבו.",
        translation: "Democracy does not end with a visit to the ballot box; every citizen must have the power to shape their life.",
        context: "Maiden Knesset speech.",
        source: "https://www.labor.org.il/articles/23901-naama-lazimi-24th-knesset-inaugural-speech.html",
        scene: "At a youth-committee desk, leaning slightly forward with both hands open; constructive listening rather than confrontation.",
      },
      {
        tier: "Uncommon", date: "2025-11-18", confidence: "verified",
        original: "הדיירים בדיור הציבורי נעלמו בכאוס של המלחמה ועכשיו בית המחוקקים עושה תיקון. זה הדבר הכי ציוני, הכי חברתי והכי יהודי שאפשר לעשות.",
        translation: "Public-housing residents disappeared amid the chaos of war, and now the legislature is making a correction.",
        context: "Committee approval of legislation restoring subsidized purchase rights for eligible public-housing tenants.",
        source: "https://main.knesset.gov.il/News/PressReleases/pages/press18112025n.aspx",
        scene: "Three-quarter speaking pose in a modest community roundtable with young adults; no banners or invented program materials.",
      },
      {
        tier: "Rare", date: "2023-01-02", confidence: "verified",
        original: "המציאות שלנו עוצבה והונדסה על ידי אנשים, ולכן יהיו אלו אנשים, אנחנו, שנעצב אותה אחרת.",
        translation: "Our reality was shaped by people, and therefore it will be people—us—who shape it differently.",
        context: "Authored post-election essay on rebuilding the Zionist left.",
        source: "https://www.labor.org.il/articles/24352-what-should-the-left-do-by-lazimi.html",
        scene: "Waist-up at a neutral parliamentary lectern, direct but warm gaze, parchment/brass light and a small red textile accent.",
      },
    ],
  },
  {
    party: "DEM", rank: 3, name: "Gilad Kariv", hebrew: "גלעד קריב",
    status: "Sitting Labor-faction MK · reported submitted Democrats slot 3",
    treatment: "favorable",
    quotes: [
      {
        tier: "Common", date: "2023-05-08", confidence: "review",
        original: "אפשר וצריך להתחייב לערכי מגילת העצמאות ולהתנגד מכוחם לאפליה, לגזענות וללאומנות.",
        translation: "We can and must commit to the Declaration of Independence and oppose discrimination, racism and ultranationalism.",
        context: "Authored call for a substantive union of the Zionist left.",
        source: "https://www.labor.org.il/articles/24400-call-for-left-forces-union.html",
        scene: "Open-handed at the head of an immigration committee table, listening posture and neutral hearing-room architecture.",
      },
      {
        tier: "Uncommon", date: "2026-06-16", confidence: "verified",
        original: "נדרוש מהממשלה להתחיל לעבוד על תוכנית חומש ממשלתית שתאט את קצב העזיבה של ישראלים את הארץ, ושתגביר את קצב החזרה של ישראלים שעזבו.",
        translation: "We will demand a five-year plan to slow emigration and increase the return of Israelis who left.",
        context: "Joint committee hearing on increased emigration.",
        source: "https://main.knesset.gov.il/News/PressReleases/Pages/press16062026a.aspx",
        scene: "Three-quarter conversational pose in a pluralistic civic roundtable; no religious props or ceremonial clothing added.",
      },
      {
        tier: "Rare", date: "2024-03-17", confidence: "review",
        original: "בואו, הצטרפו, יצאנו לדרך.",
        translation: "Come, join us; we have set out.",
        context: "Endorsing Golan for Labor leader and calling for political unification.",
        source: "https://www.labor.org.il/havoda/primary2024-chair/24529-kariv-lazimi-support-golan.html",
        scene: "Standing beside an unmarked community-meeting table, inviting gesture toward unseen participants and warm brass light.",
      },
    ],
  },
  {
    party: "DEM", rank: 4, name: "Efrat Rayten Marom", hebrew: "אפרת רייטן מרום",
    status: "Sitting Labor-faction MK · reported submitted Democrats slot 4",
    treatment: "favorable",
    quotes: [
      {
        tier: "Common", date: "2024-05-03", confidence: "verified",
        original: "הצטרפתי למפלגת העבודה כי אני רואה בה בית חברתי, ערכי ומדיני.",
        translation: "I joined Labor because I see it as a social, values-based and diplomatic home.",
        context: "Statement declining to seek the party leadership.",
        source: "https://www.labor.org.il/articles/24555-rayten-will-not-run-for-chair-2024.html",
        scene: "Seated at a legal-policy roundtable, upright open posture and hands resting visibly on a plain table.",
      },
      {
        tier: "Uncommon", date: "2026-07-07", confidence: "verified",
        original: "אני לא רואה את מדינת ישראל יכולה להמשיך להתקיים ולהתחיל לתקן את עצמה בלי שיש לה מגילת זכויות ישראלית, ובראש ובראשונה הזכות לשוויון.",
        translation: "Israel cannot begin repairing itself without an Israeli Bill of Rights, foremost the right to equality.",
        context: "Interview presenting her parliamentary and constitutional reform program.",
        source: "https://shakuf.co.il/63727",
        scene: "Three-quarter speaking pose in a parliamentary committee setting with one restrained explanatory gesture.",
      },
      {
        tier: "Rare", date: "2026-06-23", confidence: "review",
        original: "המשימה החשובה ביותר היא לנצח בבחירות, אבל לא נסתפק בזה. אנחנו חייבים להבטיח גם את ניצחון הערכים והדרך.",
        translation: "The most important task is to win the election, but we must also ensure the victory of our values and path.",
        context: "Launch of her primary campaign and justice-system program.",
        source: "https://www.ynet.co.il/news/article/by6nq0wfge",
        scene: "Standing in a bright civic corridor after a public discussion; approachable direct gaze and warm parchment/brass light.",
      },
    ],
  },
  {
    party: "RAM", rank: 1, name: "Mansour Abbas", hebrew: "מנסור עבאס",
    status: "Ra’am chair and outgoing MK · submitted slot 1",
    treatment: "analytical",
    quotes: [
      {
        tier: "Common", date: "2026-08-31", confidence: "review",
        original: "הדבר הראשון שכל אב וכל אם בחברה הערבית חושבים עליו לפני שהם נרדמים הוא האם הילדים שלי יחזרו הביתה בשלום.",
        translation: "Every parent in Arab society wonders whether their children will return home safely.",
        context: "Nazareth announcement discussing violent crime.",
        source: "https://news.walla.co.il/item/3864608",
        scene: "Eye-level portrait in a neutral committee room, seated naturally against institutional wood and muted monitors.",
      },
      {
        tier: "Uncommon", date: "2020-09-07", confidence: "verified",
        original: "המצוקה היא עצומה וכואבת ובמשרד המשפטים נותנים לנו רק את המקל, וההססנות לקדם מהלכים ולייצר פתרונות לדיור בחברה הערבית מצד משרד הבינוי היא מקוממת.",
        translation: "The housing distress is enormous, while government hesitation to create solutions for Arab society is infuriating.",
        context: "Knesset committee hearing on housing and land disputes.",
        source: "https://main.knesset.gov.il/Activity/committees/ArabSectorCrime/News/Pages/PRESS7920.aspx",
        scene: "Neutral portrait beside an Arab-municipality planning-office corridor; no plans or actions attributed to him.",
      },
      {
        tier: "Rare", date: "2021-12-21", confidence: "verified",
        original: "מדינת ישראל נולדה כמדינה יהודית. זאת החלטתו של העם והשאלה היא לא מה הזהות של המדינה; היא נולדה ככה וככה תישאר.",
        translation: "Israel was born as a Jewish state. That was the people’s decision; it was born that way and will remain that way.",
        context: "Globes Israel Business Conference interview.",
        source: "https://www.globes.co.il/news/article.aspx?did=1001395413",
        scene: "Analytical conference-room portrait with subdued press-room light; no celebratory staging or alliance-poster composition.",
      },
    ],
  },
  {
    party: "RAM", rank: 2, name: "Yoav Segalovitz", hebrew: "יואב סגלוביץ",
    status: "Former Yesh Atid MK · personally joined Ra’am slate at submitted slot 2",
    treatment: "analytical",
    quotes: [
      {
        tier: "Common", date: "2026-08-31", confidence: "review",
        original: "מה שמוביל אותי היא התפיסה הציונית, יהודית ערכית, ממנה אני יונק. מגילת העצמאות היא מצפן ולא רק טקסט כתוב על הקיר.",
        translation: "The Declaration of Independence is a compass, not merely a text hanging on the wall.",
        context: "Explanation of his personal entry onto the Ra’am slate; he did not become a Ra’am party member.",
        source: "https://news.walla.co.il/item/3864608",
        scene: "Eye-level portrait in an Internal Security Committee chamber, restrained overhead light and empty public gallery.",
      },
      {
        tier: "Uncommon", date: "2021-10-20", confidence: "verified",
        original: "האזרח הערבי לא מתעניין בתוכניות חומש. הוא רוצה מיד פתרון לתחושת הביטחון שאבדה.",
        translation: "The Arab citizen is not interested in five-year plans; he wants an immediate solution to the lost sense of security.",
        context: "Presentation of the Safe Track emergency program to a Knesset committee.",
        source: "https://main.knesset.gov.il/Activity/committees/InternalSecurity/News/pages/201021.aspx",
        scene: "Municipal public-safety office setting, neutral stance and ordinary administrative architecture without police props.",
      },
      {
        tier: "Rare", date: "2026-08-31", confidence: "review",
        original: "האמירה השגורה, שאחרי השבעה באוקטובר לא ניתן לקיים שותפות פוליטית עם מפלגות ערביות, היא מופרכת ושקרית.",
        translation: "The claim that political partnership with Arab parties is impossible after October 7 is baseless and false.",
        context: "Ra’am-slate announcement.",
        source: "https://news.walla.co.il/item/3864608",
        scene: "Separate analytical portrait in the Nazareth announcement room; balanced framing avoids alliance-poster treatment.",
      },
    ],
  },
  {
    party: "RAM", rank: 3, name: "Walid Taha", hebrew: "וליד טאהא",
    status: "Ra’am outgoing MK · submitted slot 3",
    treatment: "analytical",
    quotes: [
      {
        tier: "Common", date: "2022-06-01", confidence: "verified",
        original: "לא יכול להיות שנדרוש מקשיש לנסוע 40 ק״מ כדי לשים פתק בקלפי. זה נשמע הזוי ולא דמוקרטי.",
        translation: "We cannot demand that an elderly person travel 40 kilometres to place a ballot. It is absurd and undemocratic.",
        context: "Knesset hearing on voting access in unrecognized Bedouin villages.",
        source: "https://main.knesset.gov.il/News/PressReleases/Pages/press01062022i.aspx",
        scene: "Eye-level portrait in an Interior Committee hearing room with plain desk-level framing and cool institutional light.",
      },
      {
        tier: "Uncommon", date: "2021-10-19", confidence: "review",
        original: "או שהסיכומים יכובדו במלואם או שנלך לבחירות! חשמל הוא מצרך בסיסי של החיים.",
        translation: "Either the agreements are honored in full or we go to elections. Electricity is a basic necessity of life.",
        context: "Social statement during a coalition dispute over the Electricity Law.",
        source: "https://www.israelhayom.co.il/news/politics/article/5158581",
        scene: "Neutral portrait near an ordinary Arab-town civic building with utility infrastructure soft in the background.",
      },
      {
        tier: "Rare", date: "2021-06-22", confidence: "review",
        original: "قانون لم الشمل قانون عنصري وغير دمقراطي، لا نستطيع ولا بأي طريقة أن يمر في الموحدة.",
        translation: "The family-unification law is racist and undemocratic; there is no way we can allow it to pass through Ra’am.",
        context: "Coalition conflict over the Citizenship and Entry into Israel Law.",
        source: "https://www.kul-alarab.com/Article/997885",
        scene: "Eye-level outdoor civic portrait near a polling-place entrance, empty and neutrally framed with no implied voting action.",
      },
    ],
  },
  {
    party: "RAM", rank: 4, name: "Walid al-Hawashla", hebrew: "וליד אלהואשלה",
    status: "Ra’am outgoing MK · submitted slot 4",
    treatment: "analytical",
    quotes: [
      {
        tier: "Common", date: "2025-12-11", confidence: "review",
        original: "لا يمكن أن نتجاهل سكّان الزعرورة والفرعة… بل هم أهل البلاد في بيوتهم وعلى أراضيهم.",
        translation: "We cannot ignore the residents of al-Za’arura and al-Fur‘a; they are people of the country in their homes and on their lands.",
        context: "Knesset discussion of environmental review and proposed Negev phosphate mining.",
        source: "https://bokra.net/Article-1583783",
        scene: "Eye-level portrait in a Negev municipal-planning setting, quiet midday shade and ordinary public architecture.",
      },
      {
        tier: "Uncommon", date: "2024-06-25", confidence: "verified",
        original: "אסור להצדיק פשיעה אבל גם לא לטמון את הראש בחול. איפה שאין תעסוקה יש פשיעה.",
        translation: "Crime must not be justified, but neither should we bury our heads in the sand. Where there is no employment, there is crime.",
        context: "Knesset Labor and Welfare Committee hearing on employment services for Negev Bedouin residents.",
        source: "https://main.knesset.gov.il/news/pressreleases/pages/press25062024j.aspx",
        scene: "Restrained portrait inside a public employment-service office; neutral light and no staged interaction.",
      },
      {
        tier: "Rare", date: "2026-01-20", confidence: "verified",
        original: "אסור להפקיר את החברה הבדואית מאחור; הנושא מחייב התערבות וקבלת החלטות מיידית.",
        translation: "Bedouin society must not be abandoned; the issue requires immediate intervention and decision-making.",
        context: "State Control Committee hearing on shelter gaps in the Bedouin dispersion.",
        source: "https://main.knesset.gov.il/Activity/committees/StateControl/Pages/default.aspx",
        scene: "Analytical portrait outside a recognized municipal emergency facility in the Negev; no damage or simulated attack imagery.",
      },
    ],
  },
];

const partyMeta = {
  LIK: {
    name: "Likud",
    pip: "#1B3A6B",
    treatment: "Critical editorial treatment",
    direction: "Use harder lateral or overhead light, constrained institutional framing, guarded or formal posture, cool shadow, and visible tension in the architecture. Preserve facial geometry and age exactly. Do not add menace, decay, weapons, damaged symbols, accusatory props, or invented actions. This is a disclosed critical editorial illustration, not documentary evidence.",
  },
  DEM: {
    name: "The Democrats",
    pip: "#C43B3B",
    treatment: "Favorable editorial treatment",
    direction: "Use open posture, constructive civic settings, warm parchment and brass light, approachable eye-level framing, and restrained red accent. Preserve facial geometry and age exactly. Do not beautify, smooth age, add halos, crowds, achievements, campaign logos, or invented public support. This is a disclosed favorable editorial illustration, not documentary evidence.",
  },
  RAM: {
    name: "Ra’am",
    pip: "#2E7D4F",
    treatment: "Analytical editorial treatment",
    direction: "Use eye-level perspective, restrained natural or institutional light, issue-specific civic settings, balanced negative space, and a restrained green accent. Avoid both hero and villain coding. Preserve facial geometry and age exactly; do not add symbolic props, staged achievements, danger, poverty spectacle, or invented activity. This is an analytical editorial illustration, not documentary evidence.",
  },
};

const identityReferences = {
  "LIK-1": ["https://commons.wikimedia.org/wiki/File:Benjamin_Netanyahu_October_22,_2024_(3x4_cropped).jpg", "CC BY 2.0"],
  "LIK-2": ["https://commons.wikimedia.org/wiki/File:Israel_Katz_in_2024_(cropped).jpg", "CC BY 2.0"],
  "LIK-3": ["https://commons.wikimedia.org/wiki/File:Amir_Ohana_-_Official.jpg", "CC BY-SA 3.0"],
  "LIK-4": ["https://commons.wikimedia.org/wiki/File:Yariv_Levin_1.jpg", "CC BY-SA 3.0"],
  "DEM-1": ["https://commons.wikimedia.org/wiki/File:Yair_Golan_2025.jpg", "CC BY-SA 4.0"],
  "DEM-2": ["https://commons.wikimedia.org/wiki/File:Naama_Lazimi_(lazimi).jpg", "CC BY-SA 4.0"],
  "DEM-3": ["https://commons.wikimedia.org/wiki/File:Gilad_Kariv_(NOAM8025).jpg", "CC BY-SA 4.0"],
  "DEM-4": ["https://commons.wikimedia.org/wiki/File:Efrat_Rayten_(cropped).jpg", "CC BY-SA 4.0"],
  "RAM-1": ["https://commons.wikimedia.org/wiki/File:Mansour_Abbas_2025.jpg", "CC BY-SA 4.0"],
  "RAM-2": ["https://commons.wikimedia.org/wiki/File:Yoav_Segalovich_(R_H_4069).jpg", "CC BY-SA 4.0"],
  "RAM-3": ["https://commons.wikimedia.org/wiki/File:Walid_Taha_(SHL_8811).jpg", "CC BY-SA 4.0"],
  "RAM-4": ["https://commons.wikimedia.org/wiki/File:Walid_al-Huashla_(R_H_3683).jpg", "CC BY-SA 4.0"],
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function memberPrompt(member) {
  const party = partyMeta[member.party];
  const [identityReference, identityLicense] = identityReferences[`${member.party}-${member.rank}`];
  const canonicalParty = {
    id: member.party,
    displayNameEn: party.name,
    displayNameHe: party.hebrew || party.name,
    pip: party.pip,
  };
  const canonicalMember = {
    nameEn: member.name,
    nameHe: member.hebrew,
    slot: member.rank,
    treatment: party.treatment,
    identityReference: { url: identityReference, license: identityLicense },
  };
  return member.quotes.map((quote, index) => buildWeavePrompt({
    party: canonicalParty,
    member: canonicalMember,
    card: {
      id: `${member.party}-M${String(member.rank).padStart(2, "0")}-Q0${index + 1}`,
      slot: quote.tier,
      quote: {
        displayText: quote.original,
        status: quote.adapted ? "attributed-paraphrase" : quote.confidence === "verified" ? "exact" : "researching",
        date: quote.date,
        context: quote.context,
      },
      editorial: { scene: quote.scene, flavor: quote.flavor || "" },
    },
  })).join("\n\n--- NEXT CARD ---\n\n");
}

function quoteMarkup(quote) {
  return `
    <article class="quote">
      ${quote.adapted ? `<span class="quote-asterisk" title="Adapted or attributed wording; inspect the source note">*</span>` : ""}
      <div class="quote-meta">
        <span class="rarity ${quote.tier.toLowerCase()}">${quote.tier}</span>
        <span>${escapeHtml(quote.date)}</span>
        <span class="confidence ${quote.confidence}">${quote.confidence === "verified" ? "direct/strong source" : quote.confidence === "adapted" ? "* attributed/adapted" : "human review required"}</span>
      </div>
      <blockquote dir="rtl" lang="he">${escapeHtml(quote.original)}</blockquote>
      <p>${escapeHtml(quote.translation)}</p>
      <p class="context">${escapeHtml(quote.context)}</p>
      <a href="${escapeHtml(quote.source)}" target="_blank" rel="noopener">Inspect source ↗</a>
    </article>`;
}

function memberMarkup(member) {
  const party = partyMeta[member.party];
  const prompt = memberPrompt(member);
  return `
    <section class="member" data-party="${member.party}" data-search="${escapeHtml(`${member.name} ${member.hebrew} ${party.name}`.toLowerCase())}">
      <header class="member-head" style="--pip:${party.pip}">
        <div>
          <p class="member-code">${member.party} · SLOT ${member.rank} · ${escapeHtml(party.treatment)}</p>
          <h2>${escapeHtml(member.name)} <span lang="he">${escapeHtml(member.hebrew)}</span></h2>
          <p>${escapeHtml(member.status)}</p>
        </div>
        <button class="copy primary-copy" type="button" data-copy-member="${member.party}-${member.rank}">Copy complete member prompt</button>
      </header>
      <div class="quotes">${member.quotes.map(quoteMarkup).join("")}</div>
      ${member.sourceNote ? `<p class="source-warning">${escapeHtml(member.sourceNote.text)} <a href="${escapeHtml(member.sourceNote.url)}" target="_blank" rel="noopener">Provenance note ↗</a></p>` : ""}
      <details>
        <summary>Preview the concatenated Weave prompt</summary>
        <textarea readonly spellcheck="false">${escapeHtml(prompt)}</textarea>
      </details>
    </section>`;
}

const library = document.querySelector("#prompt-library");
const search = document.querySelector("#search");
const filters = [...document.querySelectorAll("[data-filter]")];
let activeParty = "ALL";

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

function render() {
  const query = search.value.trim().toLowerCase();
  library.innerHTML = members
    .filter((member) => (activeParty === "ALL" || member.party === activeParty)
      && `${member.name} ${member.hebrew} ${partyMeta[member.party].name}`.toLowerCase().includes(query))
    .map(memberMarkup)
    .join("");
  document.querySelector("#visible-count").textContent = `${library.children.length} / ${members.length} members`;
}

filters.forEach((button) => {
  button.addEventListener("click", () => {
    activeParty = button.dataset.filter;
    filters.forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

search.addEventListener("input", render);

library.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-member]");
  if (!button) return;
  const [party, rank] = button.dataset.copyMember.split("-");
  const member = members.find((item) => item.party === party && String(item.rank) === rank);
  await copyText(memberPrompt(member));
  const previous = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => { button.textContent = previous; }, 1400);
});

render();
